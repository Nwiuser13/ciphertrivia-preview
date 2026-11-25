// Enquiries from the site's forms (contact page, inquiry section, quick quote): each one is
// emailed through Amazon SES (SMTP) and, when a Google Sheet is connected, added to it as a row.
// Settings are Netlify environment variables, read only here: SES_SMTP_HOST, SES_SMTP_PORT,
// SES_SMTP_USER, SES_SMTP_PASS, MAIL_FROM, MAIL_TO, and for the sheet LEADS_SHEET_URL (the
// Apps Script web app in site/netlify/leads-sheet.gs) and LEADS_SHEET_KEY.
// Never log or return their values. SES_SMTP_USER is the IAM user's access key ID;
// SES_SMTP_PASS is either its SES SMTP password or its secret access key. With the secret key the
// email goes through SES's HTTPS API (one request signed here, about a second; not the AWS SDK,
// which Netlify leaves out of function bundles) and falls back to SMTP, with the key turned into
// the SMTP password here; both need the user's policy to allow ses:SendRawEmail.
// The page posts with fetch (Accept: application/json) and redirects itself to
// /thank-you/; a plain form post without JavaScript gets the redirect from here.
import { createHash, createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";

export const config = { path: "/api/contact" };

// [field name, label in the email, max length]: names match the form's inputs
const FIELDS = [
  ["name", "Full name", 200],
  ["email", "Business email", 254],
  ["phone", "Phone number", 40],
  ["company", "Company", 200],
  ["services", "What are you interested in?", 120],
  ["description", "Tell us about your requirements", 5000],
  ["page_url", "Sent from", 500],
];
const REQUIRED = ["name", "email", "phone", "company"];
const SETTINGS = ["SES_SMTP_HOST", "SES_SMTP_PORT", "SES_SMTP_USER", "SES_SMTP_PASS", "MAIL_FROM", "MAIL_TO"];
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
// The page script adds "elapsed" (ms from page load to send) and "source" (the visit's ad and
// campaign tags, referring site and first page); a post without them did not come from the page
const MIN_ELAPSED = 3000;
const FORMS = { "quick-quote": "Quick quote", inquiry: "Inquiry form" };
// Sent on every answer (GET too), so a check can tell which version of this function is live
const BUILD = { "X-Contact-Build": "ses-api-3" };

export default async (req, context) => {
  const json = (req.headers.get("accept") || "").includes("application/json");
  // Work that can finish after the visitor has their answer: Netlify keeps the function running
  // for it (context.waitUntil); where that isn't available it is awaited before answering
  const finish = (work) => (context && typeof context.waitUntil === "function" ? context.waitUntil(work) : work);
  if (req.method !== "POST") return fail(json, 405, "Method not allowed");

  let data;
  try {
    data = await req.formData();
  } catch {
    return fail(json, 400, "Unreadable form data");
  }

  // Bots that fill the hidden field get the normal answer and nothing is kept
  if (text(data.get("hp_field"), 200)) return sent(json);

  const f = {};
  for (const [key, , max] of FIELDS) f[key] = text(data.get(key), max, key === "description");
  if (REQUIRED.some((k) => !f[k]) || !EMAIL.test(f.email)) {
    return fail(json, 400, "Please fill in the required fields with a valid email address.");
  }

  const lead = leadRow(f, text(data.get("source"), 1000));
  const spam = spamReason(f, data.get("elapsed"));
  const sheetOn = Boolean(env("LEADS_SHEET_URL") && env("LEADS_SHEET_KEY"));

  // Likely spam goes to the sheet's Spam tab instead of the inbox; without a sheet it is
  // still emailed, marked, so a real enquiry is never lost
  if (spam) console.error("contact: possible spam: " + spam);
  if (spam && sheetOn) {
    await finish(toSheet("Spam", { ...lead, Reason: spam }).catch((err) => console.error("contact: spam row failed:", err.message)));
    return sent(json);
  }

  const mail = mailer();
  if (mail.error) {
    console.error("contact: " + mail.error);
    if (!sheetOn) return fail(json, 500, "Mail is not configured", mail.code);
  }

  // Email and sheet run side by side. The visitor's answer comes as soon as one of them has the
  // enquiry (the email, usually, in a second or two); the other finishes in the background.
  const state = {};
  const runs = [];
  let code;
  const track = (name, work) => {
    state[name] = "running";
    runs.push(
      work.then(
        (done) => {
          state[name] = "saved";
          if (done && done.note && !code) code = done.note;
        },
        (err) => {
          state[name] = "failed";
          const why = name === "email" ? (err && (err.responseCode || err.code)) || "SEND" : "SHEET: " + err.message;
          if (name === "email" || !code) code = why;
          console.error("contact: " + name + " failed:", why, (name === "email" && err && err.response) || "");
        }
      )
    );
  };
  if (mail.send) track("email", mail.send(message(f, lead, spam)));
  if (sheetOn) track("sheet", toSheet("Leads", lead));
  const names = Object.keys(state);
  const answerable = () => names.some((n) => state[n] === "saved") || names.every((n) => state[n] !== "running");
  if (runs.length) await new Promise((resolve) => runs.forEach((run) => run.then(() => answerable() && resolve())));
  if (names.some((n) => state[n] === "running")) await finish(Promise.all(runs));

  const saved = names.filter((n) => state[n] === "saved");
  if (!saved.length) return fail(json, 502, "Could not send", code || mail.code);
  return sent(json, saved, code || mail.code || mail.note, names.filter((n) => state[n] === "running"));
};

function env(key) {
  return (process.env[key] || "").trim();
}

// How the enquiry is emailed ({ send }), or why it can't be. When the API refuses, note says why
// at once (the answer may come while SMTP is still sending) and send resolves with it too.
function mailer() {
  const unset = SETTINGS.filter((k) => !env(k));
  if (unset.length) return { error: "missing settings: " + unset.join(", "), code: "CONFIG" };
  const host = env("SES_SMTP_HOST");
  const region = regionOf(host);
  const secret = env("SES_SMTP_PASS");
  const pass = smtpPassword(secret, region);
  if (!pass) return { error: "SES_SMTP_HOST must be the SES SMTP endpoint, email-smtp.<region>.amazonaws.com", code: "HOST" };
  const port = Number(env("SES_SMTP_PORT")) || 587;
  const smtp = () =>
    nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: env("SES_SMTP_USER"), pass },
      connectionTimeout: 7000,
      greetingTimeout: 7000,
      socketTimeout: 7000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  const mail = {
    note: "",
    async send(msg) {
      if (secret.length !== 40 || !region) return smtp().sendMail(msg);
      try {
        const raw = await new MailComposer({ ...msg, disableFileAccess: true, disableUrlAccess: true }).compile().build();
        await sesApi(raw, region, secret);
        return {};
      } catch (err) {
        const why = err && ((typeof err.code === "string" && err.code) || (err.cause && err.cause.code) || err.name);
        mail.note = "API: " + (why || "error");
        console.error("contact: SES API refused, sending by SMTP:", mail.note, err && err.message);
        await smtp().sendMail(msg);
        return { note: mail.note };
      }
    },
  };
  return mail;
}

// The enquiry email: the form's fields, where the visit came from, then the message
function message(f, lead, spam) {
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
  const rows = FIELDS.filter(([key]) => key !== "description").map(([key, label]) => [label, f[key] || "-"]);
  rows.push(["Source", lead.Source], ["Campaign", lead.Campaign || "-"], ["Landing page", lead["Landing page"] || "-"], ["Received", when]);
  const [, descLabel] = FIELDS.find(([key]) => key === "description");
  return {
    from: { name: "CipherTrivia Website", address: env("MAIL_FROM") },
    to: env("MAIL_TO"),
    replyTo: { name: f.name, address: f.email },
    subject: `${spam ? `[Possible spam: ${spam}] ` : ""}Website enquiry: ${f.company}${f.services ? ` (${f.services})` : ""}`,
    text: [
      "New enquiry from the contact form on ciphertrivia.com",
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      `${descLabel}:`,
      f.description || "-",
    ].join("\n"),
    html:
      `<p style="font:15px/1.5 Arial,sans-serif;color:#000514">New enquiry from the contact form on ciphertrivia.com</p>` +
      `<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font:14px/1.45 Arial,sans-serif;color:#000514">` +
      rows.map(([label, value]) => `<tr><th align="left" valign="top" style="border-bottom:1px solid #e3e1da;color:#5b5f6b;font-weight:normal;white-space:nowrap">${esc(label)}</th><td style="border-bottom:1px solid #e3e1da">${esc(value)}</td></tr>`).join("") +
      `</table>` +
      `<p style="font:14px/1.45 Arial,sans-serif;color:#5b5f6b;margin:20px 0 6px">${esc(descLabel)}</p>` +
      `<p style="font:15px/1.55 Arial,sans-serif;color:#000514;margin:0;white-space:pre-wrap">${esc(f.description || "-")}</p>`,
  };
}

// Why a post looks automated, or "" when it looks like a person on the page
function spamReason(f, elapsed) {
  if (elapsed == null || elapsed === "") return "sent without the page script";
  if (!(Number(elapsed) >= MIN_ELAPSED)) return "sent within 3 seconds of opening the page";
  if (/https?:\/\/|www\./i.test(f.name + " " + f.phone) || /https?:\/\//i.test(f.company)) return "link in name, phone or company";
  if ((f.description.match(/https?:\/\//gi) || []).length > 3) return "more than three links in the message";
  return "";
}

// One sheet row, keyed by the column headers in leads-sheet.gs
function leadRow(f, source) {
  let page = null;
  try {
    page = new URL(f.page_url);
  } catch {}
  const tags = new URLSearchParams(source || (page ? page.search : ""));
  return {
    Name: f.name,
    Email: f.email,
    Phone: f.phone,
    Company: f.company,
    Service: f.services,
    Message: f.description,
    Form: (page && FORMS[page.hash.slice(1)]) || (page && page.pathname === "/contact/" ? "Contact page" : "Website"),
    Page: page ? page.pathname : f.page_url,
    Source: sourceOf(tags),
    Campaign: tags.get("utm_campaign") || "",
    "Landing page": tags.get("landing") || "",
    "Google click ID": tags.get("gclid") || tags.get("gbraid") || tags.get("wbraid") || "",
  };
}

// Where the visit came from: ad click IDs first, then campaign tags, then the referring site
const AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|copilot\.microsoft\.com|gemini\.google\.com)$/;
function sourceOf(t) {
  if (t.get("gclid") || t.get("gbraid") || t.get("wbraid")) return "Google Ads";
  if (t.get("fbclid")) return "Facebook / Instagram";
  if (t.get("li_fat_id")) return "LinkedIn Ads";
  if (AI.test((t.get("utm_source") || "").toLowerCase())) return "AI assistant: " + t.get("utm_source").toLowerCase();
  const utm = [t.get("utm_source"), t.get("utm_medium")].filter(Boolean).join(" / ");
  if (utm) return utm;
  const ref = (t.get("ref") || "").toLowerCase();
  if (!ref) return "Direct";
  if (AI.test(ref)) return "AI assistant: " + ref;
  if (/(^|\.)google\.[a-z.]+$/.test(ref)) return "Google search";
  if (/(^|\.)bing\.com$/.test(ref)) return "Bing search";
  if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(ref)) return "LinkedIn";
  if (/(^|\.)(facebook|instagram)\.com$/.test(ref)) return "Facebook / Instagram";
  return ref;
}

// Adds a row through the sheet's Apps Script web app (it answers through a redirect). A failure
// says which setup step to look at, in words of our own (never the URL or the key).
async function toSheet(tab, row) {
  const res = await fetch(env("LEADS_SHEET_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: env("LEADS_SHEET_KEY"), tab, row }),
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.text();
  let out = {};
  try {
    out = JSON.parse(body);
  } catch {}
  if (out.ok) return;
  const where = new URL(res.url || "https://unknown.invalid").hostname;
  throw new Error(
    out.error ? "script says: " + out.error
    : where === "accounts.google.com" ? "Google asked to sign in: the web app is not open to Anyone"
    : where === "docs.google.com" ? "LEADS_SHEET_URL is the sheet's address, not the web app URL"
    : /Script function not found/i.test(body) ? "no doPost: paste the script, then deploy a new version"
    : !/^script\.google(usercontent)?\.com$/.test(where) ? "LEADS_SHEET_URL is not an Apps Script web app"
    : "the script failed (HTTP " + res.status + ")"
  );
}

// The SES region in the SMTP endpoint's name, email-smtp.<region>.amazonaws.com ("" if it isn't one)
function regionOf(host) {
  return ((/^email-smtp(?:-fips)?\.([a-z0-9-]+)\.amazonaws\.com$/i.exec(host) || [])[1] || "").toLowerCase();
}

// An IAM secret access key (40 characters) becomes the SES SMTP password for the endpoint's
// region, as AWS documents in "Obtaining Amazon SES SMTP credentials by converting existing
// AWS credentials"; an SMTP password (44 characters) is used as it is. Null: no region to use.
function smtpPassword(secret, region) {
  if (secret.length !== 40) return secret;
  if (!region) return null;
  const key = signingKey(secret, ["11111111", region, "ses", "aws4_request", "SendRawEmail"]);
  return Buffer.concat([Buffer.from([0x04]), key]).toString("base64");
}

// SendRawEmail through SES's HTTPS API (email.<region>.amazonaws.com): one POST, signed with
// Signature Version 4 as the AWS SDK signs it. A refusal throws with SES's error code
// (AccessDenied, MessageRejected...) as err.code, and its message without the key ID.
async function sesApi(raw, region, secret) {
  const host = `email.${region}.amazonaws.com`;
  const type = "application/x-www-form-urlencoded; charset=utf-8";
  const body = new URLSearchParams({ Action: "SendRawEmail", Version: "2010-12-01", "RawMessage.Data": raw.toString("base64") }).toString();
  const time = new Date().toISOString().replace(/[-:]|\.\d+/g, "");
  const day = time.slice(0, 8);
  const scope = `${day}/${region}/ses/aws4_request`;
  const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
  const request = ["POST", "/", "", `content-type:${type}`, `host:${host}`, `x-amz-date:${time}`, "", "content-type;host;x-amz-date", sha256(body)].join("\n");
  const signature = createHmac("sha256", signingKey(secret, [day, region, "ses", "aws4_request"]))
    .update(["AWS4-HMAC-SHA256", time, scope, sha256(request)].join("\n"), "utf8")
    .digest("hex");
  const res = await fetch(`https://${host}/`, {
    method: "POST",
    headers: {
      "Content-Type": type,
      "X-Amz-Date": time,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env("SES_SMTP_USER")}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(4000),
  });
  const reply = await res.text();
  if (res.ok) return;
  const said = ((/<Message>([^<]*)<\/Message>/.exec(reply) || [])[1] || "").split(env("SES_SMTP_USER")).join("[key ID]");
  throw Object.assign(new Error(`HTTP ${res.status} ${said}`.trim().slice(0, 300)), {
    code: (/<Code>([^<]+)<\/Code>/.exec(reply) || [])[1] || "HTTP " + res.status,
  });
}

// Signature Version 4's HMAC-SHA256 chain, starting from "AWS4" + the secret access key
function signingKey(secret, parts) {
  let key = Buffer.from("AWS4" + secret, "utf8");
  for (const part of parts) key = createHmac("sha256", key).update(part, "utf8").digest();
  return key;
}

// One trimmed line (or a block, for the description) without control characters
function text(value, max, block = false) {
  let s = typeof value === "string" ? value : "";
  s = s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ");
  s = block ? s.replace(/\n{3,}/g, "\n\n") : s.replace(/\n+/g, " ");
  return s.trim().slice(0, max);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// saved: where the enquiry went ("email", "sheet"), left out for posts that were set aside;
// pending: still finishing in the background; code: why one failed, if it did
function sent(json, saved, code, pending) {
  if (!json) return new Response(null, { status: 303, headers: { Location: "/thank-you/", ...BUILD } });
  const out = { ok: true };
  if (saved) out.saved = saved;
  if (pending && pending.length) out.pending = pending;
  if (code) out.code = String(code);
  return Response.json(out, { headers: BUILD });
}

// code: the SMTP reply or error code (535, 554, EAUTH...), never a setting's value
function fail(json, status, error, code) {
  if (json) return Response.json(code ? { ok: false, error, code: String(code) } : { ok: false, error }, { status, headers: BUILD });
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>CipherTrivia</title>` +
      `<p style="font:16px/1.5 Arial,sans-serif;margin:3rem auto;max-width:36rem;padding:0 1rem">` +
      `Something went wrong. Please email us at <a href="mailto:projects@ciphertrivia.com">projects@ciphertrivia.com</a>.</p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", ...BUILD } }
  );
}
