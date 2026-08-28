/** Shown on every page an admin views "as" a client, so it's never mistaken
 *  for that family's own session - by the admin or by anyone glancing at
 *  their screen. */
export function AdminViewBanner({ clientName }: { clientName: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        background: "#1A3F5C", color: "white", fontSize: 13, fontWeight: 600,
        padding: "8px 16px", textAlign: "center",
      }}
    >
      <span>Admin view — viewing as {clientName}</span>
      <form method="POST" action="/api/admin/stop-view-as" style={{ margin: 0 }}>
        <button
          type="submit"
          style={{
            background: "rgba(255,255,255,.15)", color: "white",
            border: "1px solid rgba(255,255,255,.35)", borderRadius: 6,
            padding: "3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Stop
        </button>
      </form>
    </div>
  );
}
