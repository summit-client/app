/**
 * Races a promise against a timeout so an auth call that never settles
 * (a hung request, a dropped connection with no error surfaced) can't leave
 * the caller waiting forever. Without this, `login.tsx`'s submit handler
 * awaited `signInWithPassword()` directly with no timeout and no try/catch
 * around it - a network failure that rejected instead of resolving with
 * `{ error }` left `loading` stuck `true` and the form permanently
 * disabled, no way out for the user. See `pages/login.tsx` for the fix.
 */
export class TimeoutError extends Error {}

// PromiseLike, not Promise: Supabase's query builders (e.g. `.single()`) are
// thenables but not full Promise instances (no .catch/.finally), so a
// `Promise<T>` parameter type rejects them at the call site.
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}
