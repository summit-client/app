/**
 * The emit half of @summit/toast. Deliberately free of React and of every
 * other dependency, so non-UI packages can announce a save without pulling
 * a presentation package in: `packages/settings` calls `toast()` from
 * `setSetting()`, which is the single change that covers every settings row
 * in every portal, including ones nobody has written yet.
 *
 * Why a shared package at all: before this there were four unrelated toasts
 * (two of them inside apps/scheduler alone) and three portals with none, so
 * "your change was saved" meant a different thing - or nothing - depending
 * on which screen you were standing on. Same reasoning that produced
 * @summit/availability: four copies of one idea is the thing to fix, not
 * the fifth copy.
 */

export type ToastTone = "success" | "error";

export interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

export const DEFAULT_SAVED_TEXT = "Changes saved";
export const DEFAULT_ERROR_TEXT = "Not saved";

type Listener = (items: ToastItem[]) => void;

const listeners = new Set<Listener>();
let items: ToastItem[] = [];
let nextId = 1;

/** Newest first, capped - a stack that grows without bound is a wall, not a
 *  notification. */
const MAX_VISIBLE = 3;

/**
 * Coalescing window. Two writes that land within this of each other collapse
 * into one toast when they carry the same text, which is what stops a
 * per-keystroke `setSetting()` (apps/employee's Ecosystem tab writes on
 * every character) or a dragged slider from emitting a toast per value.
 * Deliberately short: distinct messages are never merged, only repeats.
 */
const COALESCE_MS = 1200;
let lastText: string | null = null;
let lastAt = 0;

/** Injected clock, so tests and non-browser callers stay deterministic. */
function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function emit(): void {
  const snapshot = items;
  listeners.forEach((l) => l(snapshot));
}

function push(text: string, tone: ToastTone): void {
  const at = now();
  if (tone === "success" && text === lastText && at - lastAt < COALESCE_MS) {
    lastAt = at;
    return;
  }
  lastText = tone === "success" ? text : null;
  lastAt = at;

  const item: ToastItem = { id: nextId++, text, tone };
  items = [item, ...items].slice(0, MAX_VISIBLE);
  emit();
}

/** "Changes saved." The default exists so a call site never has to invent
 *  its own wording for the ordinary case - uniformity is the whole point. */
export function toast(text: string = DEFAULT_SAVED_TEXT): void {
  push(text, "success");
}

export function toastError(text: string = DEFAULT_ERROR_TEXT): void {
  push(text, "error");
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Wrap an auto-saving write. This is the call every new screen should use:
 * it awaits the write, announces it, and reports a failure instead of
 * swallowing it.
 *
 * It exists because the pattern it replaces - `void save(...)` with no
 * `.catch` - is all over this codebase, and it fails in the worst possible
 * way: the field keeps the value the user typed, the database does not, and
 * nothing anywhere says so. `saved()` resolves to `undefined` on failure
 * rather than rejecting, so an `onBlur` handler stays a one-liner and an
 * unhandled rejection can't escape.
 */
export async function saved<T>(
  op: Promise<T> | (() => Promise<T>),
  opts: { text?: string; errorText?: string; silent?: boolean } = {},
): Promise<T | undefined> {
  try {
    const result = await (typeof op === "function" ? op() : op);
    if (!opts.silent) toast(opts.text ?? DEFAULT_SAVED_TEXT);
    return result;
  } catch (err) {
    const detail = err instanceof Error && err.message ? err.message : "";
    toastError(opts.errorText ?? (detail ? `${DEFAULT_ERROR_TEXT}: ${detail}` : DEFAULT_ERROR_TEXT));
    return undefined;
  }
}
