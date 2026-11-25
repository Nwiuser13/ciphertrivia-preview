# CipherTrivia website

Marketing site for CipherTrivia, the cybersecurity practice of Nextwebi IT Solutions Pvt. Ltd.
Eleventy 2 (Nunjucks) static site in `site/`. Netlify builds every push to `main` and
publishes it to https://www.ciphertrivia.com in about a minute. There is no staging step:
**a push to `main` is a release.**

## Team workflow (several people and Claude Code sessions push to `main`)

1. **Pull first, every time**, before reading or editing anything: `git pull --rebase origin main`.
   Someone else may have changed the same page since you last looked.
2. Make the change. Preview with `cd site && npm install && npm start` (http://localhost:8080).
3. **Build before you push**: `cd site && npx @11ty/eleventy` must finish without errors.
4. Commit small, focused changes with a clear message (what page, what changed).
5. `git pull --rebase origin main` again, then `git push origin main`.
6. If the push is rejected, someone pushed in between: pull with rebase, resolve any conflict
   (keep both people's changes unless they clash), rebuild, push. **Never force-push `main`.**
7. If the live site doesn't update, open the deploy log in Netlify: a failed build keeps the
   previous version live.

Commands (all from `site/`): `npm start` (dev server with live reload), `npm run build` (same as `npx @11ty/eleventy`,
output in `_site/`), `npm run serve` (production server, see below). There is no test or lint script: the build
passing plus the checks at the end of this file are the gate.

Self-hosting off Netlify: the `Dockerfile` at the repo root builds the site and runs `site/server.mjs`, a plain Node
server that serves `_site/` and mounts `site/netlify/functions/contact.mjs` at `/api/contact` unchanged (the handler is a
standard Web Request to Response function). Keep the function free of Netlify-only APIs so both hosts keep working, and
give the container the same environment variables as Netlify (listed under Known open items).

Never commit secrets (tokens, SMTP/SES keys; those belong in Netlify environment variables),
`site/_site/`, `node_modules/`, or raw source material such as the `new files/` folder.

## Content rules

- Copy supplied by the site owner is used **verbatim**: no added sentences, no trimmed or reworded
  headings. Typos are flagged to the owner, not fixed silently. Don't hand-add inline links either: internal links
  are added at build time by `site/lib/autolink.js` (owner's request): the first mention of another page's topic
  in body copy becomes a link (about one per 150 words, 3 to 10 per page, one per paragraph; never in headings, bold
  labels, heroes, CTAs, forms, author bios, to the page itself or to a page it already links further up), shown as
  `.autolink` (the words over a thin orange underline), and the words stay as written. Add a new page's topic phrases
  to `TOPICS` there, insights and whitepapers included: wording the copy really uses, specific enough that every
  match means that page.
- Heading levels follow the brief exactly. Unlabelled section headings are H2; the items under
  them are H3. Lines written "Title - description" render as an H3 plus a paragraph.
- When a brief has no button text, use "Talk to Our Security Experts" and tell the owner.
- Breadcrumbs are not shown above heroes. Each page sets `crumbs` in its front matter (the same names and links
  as its BreadcrumbList JSON-LD) and the footer renders it as its first line (`.ftr__trail`). A new page needs
  both, kept identical.
- FAQ questions stay real `<h3>` elements (the `.acc[data-acc]` heading+button accordion,
  never `<details>`), and each page's FAQ also feeds its FAQPage JSON-LD from the `faqs` array.
- Client logos and certifications belong to Nextwebi. They only appear inside the
  `partials/enterprise/backed.njk` module or its home-page strip `backed-strip.njk`, each with its attribution
  (Nextwebi named on every group, the † trademark note); never present them as CipherTrivia's own.

## Design system

Every page uses `layout: layouts/enterprise.njk`. No page uses the old `base.njk` any more;
don't copy its classes (it is kept only until the owner approves deleting it).

- **No rounded corners.** One accent colour (orange, tokens `--signal-*`), ink and paper
  neutrals. Colours, type sizes and spacing come from `assets/css/enterprise/settings/tokens.css`.
- **Calm, not alarming.** The owner's test: a hospital that feels like a five-star hotel. Show the calm front of house,
  not the control room: no blinking or pulsing dots, no radar sweeps, no "live" lights, no text that scrambles like
  code, nothing moving behind copy.
- **One typeface for words.** Labels, kickers, tags, dates and footer headings use the menu's Geist sans in normal case,
  never all-caps monospace. Geist Mono is only for real code (`.prose-article code`, `.mono`) and the lettering inside
  the coded diagrams (`.sig-mono`). Text the brief itself writes in capitals stays in capitals (`.kicker--caps` adds a
  little tracking).
- **No decorative numbers** (01, 02, step counters, § indices). Use the line icons instead:
  `{% from "partials/enterprise/icons.njk" import icon %}` then `{{ icon("name") }}`, sizes
  `"sm" | "lg" | "xl" | "bare"`. New icons go in `icons.njk` on the 48-unit grid with square
  caps; the orange part sits in `<g class="ico__a">` with `pathLength="1"` on each shape.
- CSS lives in `site/src/assets/css/enterprise/` in layers imported by `main.css`
  (settings → base → layout → components → sections → utilities). Extend the matching file;
  reuse existing patterns before inventing new ones.
- Section patterns already built: `.split`, `.ledger` (`--3`, `--7`, `--10`), `.explorer`,
  `.triggers` (+ `.trigger__why`), `.includes`, `.process` (+ `--light` on white sections),
  `.deliver`, `.principles` (`--4`, `--7`), `.band`, `.faq-layout`, `.statement`, `.callout`,
  long-form `.article-hero` / `.article__toc` / `.prose-article` (+ `--legal`), and
  `.hero--status` for 404/thank-you. The service pages in `site/src/services/` show them in use.
- Industry pages have their own template (`sections/industry.css`, reference
  `site/src/industries/saas-technology.njk`): `.ind-hero` (copy on ink, the industry's banner
  photo from `assets/industries/` bleeding off the right edge), `.ihead` section headers,
  `.story` scroll-lit overview passage, `.surface` attack-surface map synced to the challenge list, `.svc-index`
  rows linked to service pages, `.bento` Why grid, `.track` engagement rail, `.fw-grid`
  framework tiles (`--7`, `--8`) with `.fw-note` (optionally headed by `.fw-note__title`). Services written "Label: description" use the `.includes` icon grid instead of `.svc-index`. Briefs without a "Why Choose" section get `backed.njk` in its own ink section before the FAQ. Each industry has its own hero composition and motion signature (`sections/industry-heroes.css`: default SaaS, `--cover` Banking, `--light --flip` Healthcare, `--light --band` Ecommerce, `--blueprint` Manufacturing, `--angled` Logistics, `--light --lift` Startups, `--mosaic` Enterprise IT) and its own icon in the overview aside: keep them distinct, never copy one industry's hero onto another.
- Hub pages (`sections/hubs.css`): `/industries/` has the photo index (`.xind`, reuses the
  `[data-explorer]` script) and the framework matrix (`.mx`, built from each industry page's
  compliance section: update its row when an industry page changes); `/services/` has the
  "What are you securing?" filter (`[data-svc-filter]`, deep link `/services/?for=api`), the
  grouped catalogue (`.cat-group`, groups match the header menu) and industry photo tiles
  (`.tiles`). A new service or industry must be added to these hubs as well as the menu and the footer.
- City pages (`sections/city.css`, reference `penetration-testing-company-bangalore.njk`):
  `.city-hero` with the `.plate` location schematic, `.has-links` for links the brief names
  inside copy, `.visit` + `.glance` engagement panel. Tone: local presence is delivery
  capability, never a "we're just down the road" pitch.
- Service-page signatures are coded SVG timelines played by `assets/js/sig.js` (load it at the end of
  the page). A container gets `data-sig="10"` (cycle in seconds); its parts get
  `data-fx="fade|hide|pop|draw|grow|growy|slide|move"` with `data-at` / `data-len` / `data-out` in seconds.
  Shared parts live in `sections/signatures.css`: `.sig-hero` (hero visual), `.board` (12:5 wide board with
  a pause button, `.board--ink` dark), `.xp` coded explorer panels (`--light` / `--ink`, mirrored for
  ≤1024 as `.explorer__inline.xp-box`) and `.xphoto` (photo frames with sighting brackets). Each service
  hero is its own: VAPT `.scanboard`, Penetration Testing `.hero--ink` + `.chain`, Web App browser and
  proxy, Mobile `hero__layout--flip` exploded phone, Cloud `.hero--cinema` (video behind the headline),
  API sequence diagram. Never reuse one page's signature on another.
- The AI Security page (`sections/ai-security.css`) has its own set: an AI chat-window hero (sig.js: a hidden instruction in an attached file, the tool call it
  triggers stopped by a guardrail and written up as a finding), the
  `.aimap` attack-surface map under the overview (cards on a CSS grid, connections and the tester's probe
  drawn by `assets/js/ai-map.js`; card names and risk tags are the page's own terms, and the dark cards mark
  the AI-specific risks), the `.ai-agent` permission boundary beside the AI Agent copy and the `.ai-report`
  example report. If the risks list changes, update the map's `aimap` array to match.
- Resource pages use icon compositions in the hero instead of photos, each its own: Whitepapers
  `.cover-stack` (`sections/resources.css`), Insights `.watch` category wall (`sections/listing.css`),
  Case Studies `.resolve` finding-to-fix loop (`sections/showcase.css`).
- Five service heroes carry a graded video (`sections/video-heroes.css`, files `assets/video/<page>.mp4` + `-poster.jpg`,
  played by the shared `[data-hero-video]` script): Consulting `.vframe` (portrait on an ink plate), DevSecOps
  `.vband` (wide band with the pipeline rail), SOC `.hero--ink` + `.vwall` (monitor wall), Compliance `.vcheck`
  (framework checklist card), Network `.hero--ink.hero--horizon` + `.vhorizon` (full-bleed mesh). Videos are
  re-encoded before use: 1280 wide, no audio, about 12 s or less, graded to ink/paper with orange kept on accents.
- Every service page is now free of placeholders. Wide slots are coded `.board` diagrams (sig.js) built from the page's
  own terms (DevSecOps pipeline gates, Network segmentation, SOC SIEM-to-incident, Compliance control mapping,
  Architecture trust boundaries, Consulting risk-to-roadmap); Penetration Testing uses a graded photo with finding pins
  (`.board__photo`); "What You Receive" slots are coded example reports (`.xreport`, cover marked EXAMPLE, rows taken
  from the page's deliverables and findings); the VAPT audience callout is the `.xaud` icon panel. Neon AI renders are
  graded ink-to-paper with saturated glow mapped to signal orange before use in `.xphoto` explorer frames.
- The home page (`sections/home.css`) has its own signature: a calm light statement hero (`.hero-home--console`) on a
  faint static 64 px grid (`.hero-home__grid`; nothing moves behind the copy), whose accent word fades in, a `.trustline` of credentials taken from existing site copy (always with "Powered by
  Nextwebi"), then the trust strip (`backed-strip.njk`, `.tstrip`: Nextwebi's 600+ clients, six credential seals and
  18 client logos, drawn in ink on white). The owner is comparing it with the full `backed.njk` module in "Why choose
  us" further down; keep both until they choose. The assessment console (`partials/enterprise/console.njk`,
  `assets/js/home-console.js`) now sits under the AI section's five steps (`.home-console`), a light product
  screen (white panels, thin lines, the menu font; scans fill bars, finished items take ticks, fixes turn green): an 18 s
  example engagement through the AI section's five stages, ending in the page's three "Example Security Findings" ranked
  and retested. Keep its stage names, notes and findings in step with those sections. `/#console-t=9.8` holds one moment
  for checking. Its counters use `data-tally` (`data-count` is the figures counter in `enterprise.js`). Further down:
  industry photos cropped 4:5 in the explorer (`assets/images/home/`), the AI section's graded loop
  (`assets/video/home-ai.mp4`, played forward then back so it loops without a cut), the small-oversights `.board--16x10`
  diagram, the whitepaper `.cover` tiles on the guide cards, and the supply-chain diagram as a still on the insight card
  (a card that is a link carries no pause button, so it uses `sig-still`). Step labels carry icons, never numbers.
- About: a minimal coded hero (`.sig-hero`: a Nextwebi code window, a shield drawn round it, two weak lines fixed); the
  "Team image" placeholder stays until the owner supplies the photo. Insight articles show a `.cover` tile in the hero
  (topic icon, tones rotating ink / paper / signal).
- Favicon: the logo mark in orange and red (the white arcs are recoloured `#E0261B` so they show on light browser tabs).
  `favicon.svg` wraps a 128 px PNG (keep it small); the home-screen icons sit on a white plate.
- The contact page map is the Google Maps embed for the "Cipher Trivia I Cybersecurity Company" listing in `.map`
  (`sections/contact.css`): `[data-map]` in `enterprise.js` sets the frame's `data-src` only as it nears the screen,
  it sits in greyscale on pointer screens until hovered or focused, and the Office row links to the listing. The embed
  and listing URLs are `officeEmbed` / `officeMap` at the top of `contact.njk`; the JSON-LD `location` uses the same link.
- Phones (≤767px) get a quick-contact bar on every page (`partials/enterprise/actionbar.njk`, `components/actionbar.css`,
  behaviour in `enterprise.js`): WhatsApp (+91 90083 72466, a greeting already typed), Call, and an orange Quick quote.
  The utility bar above the header shows "Call now" + the number and a small Quick inquiry button on phones instead of
  the emergency line. Quick quote / Quick inquiry open a `<dialog>` sheet with the contact form's required fields and
  service list (data in `_data/enquiry.json`: the page's own service is chosen via `serviceFor`, form titles via
  `titleFor`; add new service pages there), post to `/api/contact` and then show `/thank-you/`; on `/contact/` they jump
  to the form instead. The bar steps aside while a form field has focus or the menu is open, and the footer leaves room
  under it. Phone keyboards: the viewport meta has `interactive-widget=resizes-content`, each field's Next key moves to
  the following field, and the focused field is scrolled to the middle of what the keyboard leaves visible.
- Service and campaign landing pages (the 12 service pages, AI Security, the Bangalore page) set `inquiry: true`: the
  layout adds the inquiry section (`partials/enterprise/inquiry.njk`, `sections/inquiry.css`) after the content, and
  every contact button on the page (hero, bands, final CTA, header, phone bars) scrolls to it and puts the cursor in
  the form instead of leaving for /contact/. Google Ads and social campaigns land on these pages.
- Footer (`partials/enterprise/footer.njk`): every service in two columns, every industry, then Company & Resources;
  privacy, terms and NDA links sit in small type in the base row. A new service or industry goes here too.
- SEO plumbing: `partials/enterprise/schema-site.njk` puts one full Organization record (phone, email, address, map,
  profiles, services), the WebSite and a WebPage on every page; page blocks point at the organisation by `@id`
  (`https://www.ciphertrivia.com/#organization`). Front matter: `pageSchema: false` where the page has its own
  AboutPage/ContactPage/CollectionPage node, `collectionOf: "/insights/"` for listing pages (the ItemList builds
  itself), `crumbsSchema: true` where a page has `crumbs` but no BreadcrumbList block. Share cards: every page has
  its own 1200 × 630 `assets/og/<slug>.jpg` (ink card: category, the page's H1, its photo or topic icon); a page
  without one shares the home card, so make one when adding a page. The cards print the phone number: if it changes
  (search the repo for it: `_data/enquiry.json`, header, footer, schema, the contact cards, `llms.txt`, `enterprise.js`),
  re-render every card and bump `?v=` on `ogImg` in the layout so share caches fetch them again. `src/llms.txt` summarises the company and lists
  every page with its meta description for AI assistants: add a line for each new page.
- Stock or AI images are graded to the palette before use (ink-to-paper duotone, orange kept only on warm
  accents) and must not show other companies' logos.
- Two dark (`section--ink`) sections should never touch.

## Images

Grey placeholder boxes are the `ph(label, spec, ratio, variant)` macro from
`partials/enterprise/macros.njk`. The spec states the required size and subject, for example
`"1200 × 1200 · Analysts monitoring security events in a SOC"`. To replace one, put the file in
`site/src/assets/images/<page>/` (WebP, exported at the stated size), swap the macro for an
`<img>` with real `alt` text and `width`/`height`, and keep the stated aspect ratio.

## Before pushing a page change, check

- The build passes and the page has no horizontal scroll at 360, 768, 1024 and 1440px wide.
- Headings and copy still match the owner's brief; JSON-LD still parses.
- Header menu: rebuilt service pages set `aria-current` on their own link in
  `partials/enterprise/header.njk`.

## Known open items

- The contact form posts to `/api/contact`, the Netlify Function `site/netlify/functions/contact.mjs`
  (Node 22 via `site/.nvmrc`), which emails each enquiry through Amazon SES (its HTTPS API, one request the function
  signs itself, about a second; nodemailer SMTP as the fallback. Don't add the AWS SDK: Netlify leaves `@aws-sdk/*`
  out of function bundles) and, when connected,
  adds it to the owner's Google Sheet (an Apps Script web app; its code and setup steps are in
  `site/netlify/leads-sheet.gs`). Its settings `SES_SMTP_HOST`, `SES_SMTP_PORT`, `SES_SMTP_USER`, `SES_SMTP_PASS`,
  `MAIL_FROM`, `MAIL_TO`, `LEADS_SHEET_URL` and `LEADS_SHEET_KEY` are Netlify environment variables. On this Netlify
  plan they are also visible to the build, so **only that function may read them**: never reference them in
  templates, `_data` or `.eleventy.js`, never log them, never commit them. `SES_SMTP_PASS` holds the IAM user's
  secret access key, which the function converts into the SES SMTP password (an SMTP password also works).
  Keep the form's field names (`name`, `email`, `phone`, `company`, `services`, `description`, `page_url`,
  honeypot `hp_field`) in step with the function, in `contact.njk`, `inquiry.njk` and the quick-quote sheet in
  `actionbar.njk`. The page scripts add `elapsed` (ms on the page) and `source` (the visit's ad and campaign tags,
  referrer and first page, kept in sessionStorage `ct_source` by `enterprise.js`): a post without them, sent within
  3 s, or with links in name/phone/company goes to the sheet's Spam tab instead of the inbox (no sheet: it is
  emailed with "[Possible spam]" in the subject). No visible CAPTCHA, by choice: it costs ad leads.
- The Security Compliance page has two "Why Choose" sections; the owner is choosing one.
