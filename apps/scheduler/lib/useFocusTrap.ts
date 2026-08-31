import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibility pass finding: every modal in this app already closes on
 * Escape and on an outside click, but nothing kept keyboard focus contained
 * while one was open - Tab could walk focus straight out into the page
 * underneath (or the cross-portal nav bar) with the modal still sitting on
 * top of it, and closing a modal left focus wherever Tab had wandered
 * instead of back on whatever opened it. A calendar/slot picker has to be
 * fully operable by keyboard alone, and an untrapped modal isn't that.
 *
 * Attach the returned ref to the modal's outer container (give it
 * `tabIndex={-1}` so it's a valid focus target when the modal itself has no
 * focusable children yet). Moves focus into the container on mount (the
 * first focusable descendant, or the container itself), wraps Tab/Shift+Tab
 * at the container's boundary, and restores focus to whatever was focused
 * before the modal opened once it unmounts.
 */
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusables()[0];
    (first ?? container).focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
