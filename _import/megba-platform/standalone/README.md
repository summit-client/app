# MEGBA — Standalone single-file site

`megba-standalone.html` is a **complete, self-contained** MEGBA landing page:
one file, all CSS inline, the logo embedded as a data URI, and only a few lines
of vanilla JS (mobile menu). **No build step, no server, no dependencies.**

Use it wherever you can't run a Next.js app.

---

## Option A — Launch on Netlify (drag & drop, 30 seconds)

1. Go to <https://app.netlify.com/drop>.
2. Drag the **`standalone/` folder** (or just rename `megba-standalone.html` to
   `index.html` and drag that file) onto the page.
3. Netlify gives you a live URL instantly. Done.

> Tip: rename the file to `index.html` so it loads at the site root.

## Option B — Embed in Wix (HTML)

Wix can't host a Next.js app, but it can embed this file. Two ways:

**B1. Iframe embed (recommended — full fidelity):**
1. Host the file first (use **Option A** above, or any host) to get a URL.
2. In the Wix Editor: **Add → Embed Code → Embed a Site (iframe / HTML)**.
3. Paste the hosted URL. Stretch the element to full width and set a tall height.

**B2. Paste the code directly:**
1. In the Wix Editor: **Add → Embed Code → Custom Embed → Add Code (HTML iframe)**.
2. Open `megba-standalone.html` in a text editor, copy **all** of it, and paste.
3. Save & publish.
   - If Wix rejects it for size, use **B1** instead (some Wix embed widgets cap
     inline code length; the hosted-iframe route has no such limit).

**B3. Wix full page:** If you want it as a whole page rather than a widget,
use **B1** with the iframe set to full-page dimensions, or host on Netlify and
point a Wix menu link / subdomain at it.

## Option C — Just open it

Double-click `megba-standalone.html` — it opens in any browser, offline.

---

## Editing

Everything is plain HTML/CSS in one file — edit the text directly. Brand colours
are CSS variables near the top (`--forest`, `--ivory`, `--maple` red, etc.).

To regenerate after replacing the logo, re-run the generator
(`scratchpad/build_standalone.py`) or just swap the `data-logo` handling.

> This one-pager mirrors the marketing message of the full Next.js site in
> `../` (which has ~40 pages, portals, course catalogue, and a CMS-ready data
> layer). Use the standalone file for quick launches; use the full app when you
> want the whole platform.
