/**
 * Shown when resolving the signed-in account itself failed (a real query
 * error - network blip, transient DB error), as distinct from
 * AccountProblemNotice (the account resolved fine but has no clinic or no
 * linked client). Previously this case fell through to "not-permitted" and
 * silently redirected the user to their role's home page, which looks
 * exactly like "you're signed in as the wrong role" from the outside - a
 * transient failure shouldn't read as an access decision.
 */
export function LoadErrorNotice() {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Something went wrong</h1>
      <p style={{ color: "#6B7280", fontSize: 14 }}>
        We couldn&apos;t load your account right now. Try refreshing the page - if this keeps
        happening, contact your clinic.
      </p>
    </main>
  );
}
