/**
 * Type checking for a setting's value, on the way in.
 *
 * Every setting definition declares a `type`, and until now nothing enforced
 * it: setSetting() checked that the key existed and that a locked key was
 * written at org level, then persisted whatever it was handed. The widget was
 * the only constraint, so anything calling the API directly - or any future
 * control that forgets - could store `"nonsense"` in a colour, an
 * off-menu string in a select, or a string in a number. A colour goes
 * straight into a CSS custom property and a select value is read back by
 * code that expects one of its options.
 *
 * Kept in its own dependency-free file so tests/value-types.test.mjs can
 * compile and exercise it directly: index.ts pulls in @summit/session and a
 * Supabase client, which a plain node test cannot load.
 */

export type SettingValueLike = string | number | boolean;

export interface ValueTypeDef {
  type: "toggle" | "select" | "text" | "number" | "color" | "time";
  options?: { value: string; label: string }[];
  label?: string;
}

/** `#rrggbb`. Not `#rgb`: `<input type="color">` always emits the long form,
 *  and every consumer writes the value into a CSS custom property as-is. */
const HEX = /^#[0-9a-f]{6}$/i;

/** 24-hour `HH:MM`, what `<input type="time">` produces. */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The reason a value is unacceptable, or null when it is fine.
 *
 * `null`/`undefined` is always acceptable - clearing an override is how a
 * user drops back to the level above, and setSetting() handles it as a
 * delete rather than a write.
 */
export function settingValueProblem(def: ValueTypeDef, value: SettingValueLike | null | undefined): string | null {
  if (value == null) return null;
  const name = def.label ?? "This setting";

  switch (def.type) {
    case "toggle":
      return typeof value === "boolean" ? null : `${name} is on/off, so it needs true or false.`;

    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `${name} needs a number.`;

    case "select": {
      const allowed = (def.options ?? []).map((o) => o.value);
      if (allowed.length === 0) return null; // nothing declared to check against
      return allowed.includes(String(value)) ? null : `${String(value)} is not one of ${name}'s options.`;
    }

    case "color":
      return typeof value === "string" && HEX.test(value)
        ? null
        : `${name} needs a colour like #1b5a6e.`;

    case "time":
      // "" is a real state: clearing a time input is how a user says "none",
      // and the setting's own default takes over from there.
      return typeof value === "string" && (value === "" || TIME.test(value))
        ? null
        : `${name} needs a time like 09:30.`;

    case "text":
      return typeof value === "string" ? null : `${name} needs text.`;
  }
}
