/**
 * OKLCH → sRGB, in about forty lines of arithmetic and no dependency.
 *
 * The browser does this itself: CSS ships `oklch(55% 0.130 205)` and the
 * engine resolves it. React Native has no CSS engine, so the same colour has
 * to arrive as a hex string, and the conversion has to happen in JavaScript
 * that runs inside Expo Go.
 *
 * Culori or colorjs.io would do this too. Neither is worth a dependency in a
 * phone bundle for one function, and both are larger than the maths.
 */

/** A colour in the palette. `h` may name a dial rather than fix an angle. */
export type Oklch = {
  l: number;
  c: number;
  h: number | "hue" | "hue-deep";
  /** Alpha, 0–1. Omitted means opaque. */
  a?: number;
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** sRGB transfer function — the gamma encoding, not a plain power of 1/2.2. */
function encodeGamma(channel: number): number {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/**
 * OKLab → linear sRGB, then gamma-encoded and clamped.
 *
 * Out-of-gamut colours are clamped per channel rather than gamut-mapped. Every
 * colour in this palette is inside sRGB, so nothing currently clips; a new one
 * that does will read as slightly flat rather than as an error, which is worth
 * knowing before adding a very saturated step.
 */
export function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  return [
    +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S,
  ].map((linear) => Math.round(clamp01(encodeGamma(linear)) * 255)) as [number, number, number];
}

/** `#rrggbb`, or `#rrggbbaa` when the colour carries alpha. */
export function oklchToHex(colour: Oklch, hue: number, hueDeep: number): string {
  const h = colour.h === "hue" ? hue : colour.h === "hue-deep" ? hueDeep : colour.h;
  const [r, g, b] = oklchToRgb(colour.l / 100, colour.c, h);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const alpha = colour.a === undefined || colour.a >= 1 ? "" : hex(Math.round(colour.a * 255));
  return `#${hex(r)}${hex(g)}${hex(b)}${alpha}`;
}

/**
 * WCAG relative luminance and contrast, computed from sRGB — which is why
 * rotating the hue dial moves contrast ratios at all, despite OKLCH lightness
 * staying put.
 */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
