/**
 * Regenerates the two brand values Expo reads at build time, from the palette.
 *
 *   node scripts/build-brand.mjs
 *
 * app.json's splash colour and assets/images/icon.png are config and a binary
 * — neither can call useTheme(). That does not make them a licence to paste a
 * hex: they are generated from @summit/design like everything else, and
 * tests/theme.test.mjs fails if app.json drifts from the palette.
 *
 * The icon is a flat colour field. It is a placeholder for real artwork, and
 * being generated is the point: it cannot be the wrong blue.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const APP = dirname(dirname(fileURLToPath(import.meta.url)));

const out = join(mkdtempSync(join(tmpdir(), "summit-brand-")), "theme.mjs");
await build({
  entryPoints: [join(APP, "src", "lib", "theme.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: out,
  logLevel: "silent",
});
const { buildTheme } = await import(pathToFileURL(out).href);

/** The brand colour, resolved from the shared palette rather than chosen. */
export const brandColour = () => buildTheme("blue", "light").colors.accent;

/** A solid-colour PNG, written by hand so the script needs no image library. */
function solidPng(hex, size) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const p = row + 1 + x * 4;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b; raw[p + 3] = 255;
    }
  }
  const table = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const colour = brandColour();

const appJsonPath = join(APP, "app.json");
const appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
const splash = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-splash-screen");
splash[1].backgroundColor = colour;
writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);

const png = solidPng(colour, 1024);
writeFileSync(join(APP, "assets", "images", "icon.png"), png);

console.log(`brand colour ${colour} — app.json splash updated, icon.png ${png.length} bytes`);
