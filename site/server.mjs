// Production server for self-hosting (Dockploy/VPS): serves the Eleventy build in _site/ and
// runs the contact form's API route in plain Node, reusing the Netlify Function unchanged
// (its handler is a standard Web Request -> Response function; only the transport differs).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import contact, { config as contactConfig } from "./netlify/functions/contact.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(ROOT, "_site");
const PORT = process.env.PORT || 8080;
const API_PATH = contactConfig.path; // "/api/contact"

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
};

async function toWebRequest(req, url) {
  const chunks = [];
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  if (hasBody) for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody && chunks.length ? Buffer.concat(chunks) : undefined,
  });
}

async function sendWebResponse(res, webRes) {
  const headers = {};
  for (const [name, value] of webRes.headers) headers[name] = value;
  res.writeHead(webRes.status, headers);
  res.end(Buffer.from(await webRes.arrayBuffer()));
}

// Resolves a request path to a file under _site (pretty URLs, directory index, 404.html)
async function resolveFile(pathname) {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = clean.endsWith("/")
    ? [clean + "index.html"]
    : [clean, clean + "/index.html", clean + ".html"];
  for (const candidate of candidates) {
    const full = path.join(SITE_DIR, candidate);
    if (!full.startsWith(SITE_DIR)) continue;
    try {
      const info = await stat(full);
      if (info.isFile()) return full;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === API_PATH) {
    const webReq = await toWebRequest(req, url.toString());
    const webRes = await contact(webReq, {});
    return sendWebResponse(res, webRes);
  }

  const file = await resolveFile(url.pathname);
  if (file) {
    const body = await readFile(file);
    const type = MIME[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    });
    return res.end(body);
  }

  const notFound = await readFile(path.join(SITE_DIR, "404.html")).catch(() => Buffer.from("Not found"));
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(notFound);
}).listen(PORT, () => console.log(`CipherTrivia server on :${PORT}`));
