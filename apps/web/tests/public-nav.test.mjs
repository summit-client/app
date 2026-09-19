/**
 * The landing page's mobile menu, read out of the shipped source.
 *
 * The bug this pins: the menu was React state, so the dropdown did not exist
 * in the DOM until a click handler ran. On a phone the header's own "Log in"
 * link is display:none, so that dropdown was the ONLY route to signing in —
 * and before hydration finished, or permanently if it failed, tapping the
 * hamburger did nothing and a visitor could not reach the product at all.
 * Confirmed by loading the page with JavaScript disabled.
 *
 * So the rule is: the menu opens without JavaScript. These assertions exist to
 * stop someone reintroducing a click handler as the mechanism.
 *
 * Run: node apps/web/tests/public-nav.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const nav = readFileSync(join(here, "..", "components", "PublicNav.tsx"), "utf8");
const css = readFileSync(join(here, "..", "styles", "globals.css"), "utf8");
const app = readFileSync(join(here, "..", "pages", "_app.tsx"), "utf8");

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, detail); }
};

// --- the mechanism is a checkbox, not state ------------------------------
t("the menu's state is a checkbox", /type="checkbox"[\s\S]{0,200}pubnav-toggle-input/.test(nav));
t("the panel is always in the DOM, not conditionally mounted",
  !/\{\s*mobileOpen\s*&&/.test(nav) && /className="mobile-nav-panel"/.test(nav));
t("no React state drives the menu", !/mobileOpen/.test(nav));
t("the hamburger is a label pointing at the checkbox",
  /<label[^>]*htmlFor=\{MENU_ID\}[^>]*className="mobile-nav-toggle"/.test(nav));
t("both icons ship, so swapping them needs no re-render",
  /mobile-nav-icon-open/.test(nav) && /mobile-nav-icon-close/.test(nav));
t("tap-outside-to-close is a label, not a listener",
  /className="mobile-nav-backdrop"/.test(nav) && !/mousedown/.test(nav));

// --- CSS actually opens it ------------------------------------------------
t("the checkbox shows the panel", /\.pubnav-toggle-input:checked\s*~\s*\.mobile-nav-panel\s*\{[^}]*display:\s*flex/.test(css));
t("the panel is closed by default", /\.mobile-nav-panel\s*\{[\s\S]*?display:\s*none/.test(css));
t("the checkbox swaps the icon",
  /:checked\s*~\s*\.pubnav-inner\s+\.mobile-nav-icon-open\s*\{[^}]*display:\s*none/.test(css));
t("the checkbox shows the backdrop", /:checked\s*~\s*\.mobile-nav-backdrop\s*\{[^}]*display:\s*block/.test(css));
t("the panel cannot strand open on desktop",
  /@media \(min-width: 781px\)[\s\S]{0,160}:checked\s*~\s*\.mobile-nav-panel\s*\{[^}]*display:\s*none/.test(css));
t("the keyboard control keeps a visible focus ring",
  /:focus-visible\s*~\s*\.pubnav-inner\s+\.mobile-nav-toggle/.test(css));

// --- the reason any of it matters ----------------------------------------
t("the header's own Log in is still hidden on a phone, so the panel carries one",
  /\.pubnav-login \{ display: none; \}/.test(css) && /href="\/login" className="mobile-nav-link"/.test(nav));
t("globals.css is imported — it went years not being, see CLAUDE.md",
  /import '\.\.\/styles\/globals\.css'/.test(app));

// --- JavaScript may enhance, never carry ---------------------------------
const effects = [...nav.matchAll(/useEffect\(/g)].length;
t("at most two effects remain (scroll shadow, Escape)", effects <= 2, `found ${effects}`);
t("Escape is the only menu behaviour left in JS",
  /e\.key !== 'Escape'/.test(nav) && !/addEventListener\('resize'/.test(nav));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
