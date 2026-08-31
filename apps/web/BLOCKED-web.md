# Blocked items — apps/web

Nothing in the numbered work list (1-8) was blocked. Every item was
completed inside `apps/web`, using only dependencies already in
`apps/web/package.json` (the password show/hide icons are hand-written
inline SVG, not a new icon-library dependency; the CTA contrast fix is a
CSS-only overlay). No change under `packages/` was needed for any of it.

Two things worth a human decision that aren't "blocked" in the packages/
sense, flagged here anyway since they're workarounds rather than complete
fixes:

- **Brand colours now have two sources of truth.** `pages/index.tsx`'s own
  JS consts (`navy`/`teal`/`g100`/`g500`/`g700`/`off`) drive the landing
  page's inline styles, unchanged. The new auth-page CSS
  (`components/auth/*`, the `.auth-*` rules in `globals.css`) needed the
  same palette in actual CSS, so it's now also defined as CSS custom
  properties on `:root` (`--brand-navy`, `--brand-teal`, etc. - see the
  comment above them in `globals.css`). Same literal hex values, not a
  new source of truth so much as a second copy of the existing one.
  Retrofitting `index.tsx` to read from the CSS custom properties instead
  of its own consts (they can't share directly - one's TS, one's CSS) is a
  larger, separate change I didn't think this pass should risk; flagging
  so it doesn't look like an oversight.
- **`PublicNav` still has no mobile menu.** At <=780px the desktop nav
  links (Features / How it works / Reviews) disappear entirely with
  nothing replacing them - a pre-existing gap, not something this pass
  introduced or was asked to fix. A phone user can still reach those
  sections by scrolling manually, so nothing is actually broken, but it's
  a real functionality gap on top of everything this pass did fix. Left
  alone: building a mobile nav drawer is a discretionary feature add
  beyond the 8 listed items, not a bug fix, and CLAUDE.md's documented
  mobile-nav-drawer pattern is specifically for in-app sidebars
  (`apps/data`/`apps/employee`), not this marketing top bar.

See the PR description for everything else worth flagging (dead
`/privacy`/`/terms` footer links, the testimonial/logo-strip placeholder
names, copy I need from Yanko) - none of those needed a packages/ change
or a new dependency either, so they don't belong in this file.
