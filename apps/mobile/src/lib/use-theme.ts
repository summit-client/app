import { useColorScheme } from "react-native";

import { buildTheme, type Theme } from "./theme";

/**
 * The palette for whichever appearance the phone is in.
 *
 * Only the default `blue` accent for now: the web's other three are a
 * per-browser preference with no mobile equivalent, and a tenant's own hue is
 * wired to nothing on either side yet (issue #209). When it is, this is the
 * one place that has to learn about it.
 *
 * `buildTheme` memoises, so this returns the same object every render and is
 * safe as a dependency.
 */
export function useTheme(): Theme {
  return buildTheme("blue", useColorScheme() === "dark" ? "dark" : "light");
}
