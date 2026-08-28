import type { SelectableClient } from "../lib/admin-view-as";

/**
 * The admin-only "view as" picker, shown in place of the dashboard on the
 * client portal's landing page when the signed-in user is an admin with no
 * client chosen yet. Lives on the landing page itself (not a separate
 * /admin route) so it's the first thing an admin sees when they follow the
 * cross-portal nav link.
 */
export function SelectClient({ clients }: { clients: SelectableClient[] }) {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>View as a client</h1>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 28 }}>
        Pick a family to see exactly what their dashboard shows - for diagnosing a reported issue.
        Read-only; nothing you do here is saved as them.
      </p>
      {clients.length === 0 ? (
        <p style={{ color: "#6B7280" }}>No clients in your clinic yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clients.map((c) => (
            <form key={c.id} method="POST" action="/api/admin/view-as">
              <input type="hidden" name="clientId" value={c.id} />
              <button
                type="submit"
                style={{
                  width: "100%", textAlign: "left", padding: "12px 16px",
                  border: "1px solid #E5E7EB", borderRadius: 10,
                  background: "white", cursor: "pointer", fontSize: 15,
                }}
              >
                {c.name || "Unnamed client"}
              </button>
            </form>
          ))}
        </div>
      )}
    </main>
  );
}
