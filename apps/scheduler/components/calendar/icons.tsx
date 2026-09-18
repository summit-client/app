/**
 * Calendar icon shims.
 *
 * The art now lives in @summit/design/icons - the one set shared by every
 * portal. This file's five named components stayed put as thin wrappers so
 * the ~40 call sites across TimeGrid, MonthGrid, SessionDetail and the
 * reschedule dialogs did not all have to change in the same commit, and so
 * their `title` behaviour (an accessible name on an otherwise decorative
 * glyph) keeps working.
 *
 * The header here used to argue that a shared icon library "doesn't fit this
 * app's existing pattern", because apps/scheduler keeps its own tokens
 * rather than importing @summit/design. That reasoning applied to the CSS,
 * not to components: these carry no styling beyond currentColor, so the app
 * takes the icons without taking the stylesheet. Its tokens are untouched.
 *
 * SessionTypeDot has no equivalent in the shared set and stays local - it is
 * a filled swatch of a per-type colour, not a line icon.
 */
import * as React from "react";
import { Icon, type IconName } from "@summit/design/icons";

interface IconProps {
  size?: number;
  color?: string;
  title?: string;
}

/** Wraps a shared icon with this file's colour/title contract. */
function shim(name: IconName, defaultSize: number) {
  return function Shim({ size = defaultSize, color, title }: IconProps) {
    return (
      <Icon
        name={name}
        size={size}
        style={color ? { color } : undefined}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        role={title ? "img" : undefined}
      />
    );
  };
}

export const LocationPinIcon = shim("location", 14);
export const HomeIcon = shim("home", 14);
export const ClinicianIcon = shim("staff", 14);
export const ClientIcon = shim("client", 14);
export const RecurringIcon = shim("recurring", 14);

export function SessionTypeDot({ size = 8, color }: { size?: number; color: string }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}
