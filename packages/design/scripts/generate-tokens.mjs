/**
 * Generates tokens.css from src/tokens.ts.
 *
 *   node scripts/generate-tokens.mjs           # write tokens.css
 *   node scripts/generate-tokens.mjs --stdout  # print it, touch nothing
 *
 * The source is TypeScript because React Native reads the same file; the CSS
 * is an artifact. tests/tokens-generated.test.mjs re-runs this on every PR and
 * fails if the committed CSS disagrees with what it produces.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** tokens.ts is TypeScript, so it is bundled before it can be imported. */
export async function loadTokens() {
  const out = join(mkdtempSync(join(tmpdir(), "summit-tokens-")), "tokens.mjs");
  await build({
    entryPoints: [join(ROOT, "src", "tokens.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: out,
    logLevel: "silent",
  });
  return import(pathToFileURL(out).href);
}

const pct = (n) => `${n}%`;
const chroma = (c) => (c === 0 ? "0" : c.toFixed(3));
const alpha = (a) => ` / ${a.toFixed(2)}`;

/** The CSS form keeps the live dial: `var(--hue)`, not a resolved angle. */
function cssValue(value) {
  if ("raw" in value) return value.raw;
  const h = value.h === "hue" ? "var(--hue)" : value.h === "hue-deep" ? "var(--hue-deep)" : String(value.h);
  return `oklch(${pct(value.l)} ${chroma(value.c)} ${h}${value.a === undefined ? "" : alpha(value.a)})`;
}

const RULE = "─";

/** `/* ── Title ─────── *\/`, padded to a consistent width. */
function header(title, indent) {
  const line = `${indent}/* ${RULE.repeat(2)} ${title} `;
  return line + RULE.repeat(Math.max(3, 79 - line.length)) + " */";
}

/** A prose block, re-wrapped under the indent it is emitted at. */
function comment(text, indent) {
  const lines = text.split("\n").map((l) => l.trim());
  return [`${indent}/* ${lines[0]}`, ...lines.slice(1).map((l) => (l ? `${indent}   ${l}` : "")), `${indent}   */`].join("\n");
}

function declLine(d, indent) {
  const note = d.note ? `  /* ${d.note} */` : "";
  return `${indent}${d.name}: ${cssValue(d.value)};${note}`;
}

function emitGroups(groups, indent) {
  return groups
    .map((g) => {
      const lines = [];
      if (g.title) lines.push(header(g.title, indent));
      if (g.comment) lines.push(comment(g.comment, indent));
      for (const d of g.decls) {
        if (d.before) lines.push(comment(d.before, indent));
        lines.push(declLine(d, indent));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export async function generate() {
  const { LIGHT, DARK, ACCENTS, NON_DEFAULT_ACCENTS, accentDecls } = await loadTokens();
  const out = [];

  out.push(readFileSync(join(ROOT, "src", "head.css"), "utf8").trimEnd(), "");
  out.push(":root {");
  out.push(emitGroups(LIGHT, "  "));
  out.push("}", "");

  out.push("/* ---- accent ramps (light) ------------------------------------------------ */");
  for (const name of NON_DEFAULT_ACCENTS) {
    const a = ACCENTS[name];
    out.push(`:root[data-accent="${name}"] {`);
    out.push(`  --hue: ${a.hue}; --hue-deep: ${a.hueDeep};`);
    out.push(...accentDecls(a.light).map((d) => declLine(d, "  ")));
    out.push("}");
  }
  out.push("");

  out.push("/* ---- dark theme ----------------------------------------------------------");
  out.push("   The same OKLCH families, dropped in lightness and eased in chroma so the");
  out.push("   calm reads at night too. Accents lighten to hold contrast on dark ground.");
  out.push("");
  out.push("   Emitted twice from one definition in src/tokens.ts: once for \"follow the");
  out.push("   OS\", once for \"the user chose dark\". */");

  const darkBody = (indent) => DARK.map((d) => declLine(d, indent));
  const darkAccent = (name, indent) => accentDecls(ACCENTS[name].dark).map((d) => declLine(d, indent));

  out.push("@media (prefers-color-scheme: dark) {");
  out.push('  :root:not([data-theme="light"]) {');
  out.push(...darkBody("    "));
  out.push("  }");
  for (const name of NON_DEFAULT_ACCENTS) {
    out.push(`  :root:not([data-theme="light"])[data-accent="${name}"] {`);
    out.push(...darkAccent(name, "    "));
    out.push("  }");
  }
  out.push("}");

  out.push(':root[data-theme="dark"] {');
  out.push(...darkBody("  "));
  out.push("}");
  for (const name of NON_DEFAULT_ACCENTS) {
    out.push(`:root[data-theme="dark"][data-accent="${name}"] {`);
    out.push(...darkAccent(name, "  "));
    out.push("}");
  }
  out.push("");

  out.push(readFileSync(join(ROOT, "src", "base.css"), "utf8").trimEnd(), "");
  return out.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = await generate();
  if (process.argv.includes("--stdout")) process.stdout.write(css);
  else {
    writeFileSync(join(ROOT, "tokens.css"), css);
    console.log(`tokens.css written — ${css.split("\n").length} lines`);
  }
}
