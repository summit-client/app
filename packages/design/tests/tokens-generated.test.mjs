/**
 * tokens.css is generated. This is the guard that keeps that true.
 *
 * Re-runs the generator and compares its output with the committed file. A
 * hand-edit to tokens.css fails here rather than being silently overwritten by
 * the next person who runs the generator — which is the failure mode that
 * makes "generated file" checked into git a bad idea otherwise.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../scripts/generate-tokens.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const committed = readFileSync(join(ROOT, "tokens.css"), "utf8");
const generated = await generate();

if (committed === generated) {
  console.log(`tokens.css matches src/tokens.ts — ${generated.split("\n").length} lines\n\n1 passed, 0 failed`);
  process.exit(0);
}

const a = committed.split("\n");
const b = generated.split("\n");
console.log("tokens.css does NOT match what src/tokens.ts generates.\n");
let shown = 0;
for (let i = 0; i < Math.max(a.length, b.length) && shown < 10; i++) {
  if (a[i] !== b[i]) {
    console.log(`  line ${i + 1}\n    committed: ${a[i] ?? "(end of file)"}\n    generated: ${b[i] ?? "(end of file)"}`);
    shown++;
  }
}
console.log("\nIf the change belongs in the palette, make it in src/tokens.ts and run");
console.log("  pnpm --filter @summit/design build:tokens");
console.log("\n0 passed, 1 failed");
process.exit(1);
