import styles from "../styles/design-b.module.css";

/** Shown on every page an admin views "as" a client, so it's never mistaken
 *  for that family's own session - by the admin or by anyone glancing at
 *  their screen.
 *
 *  Sticky (styles.adminBanner, in design-b.module.css) so it can't be
 *  scrolled out of view on a tall dashboard - see that class's own comment
 *  for why it sticks below the cross-portal AppNav bar rather than at
 *  top:0, and for how the mobile topbar that always renders right after
 *  this stacks under it instead of colliding.
 *
 *  The name is ellipsis-truncated (min-width:0 + white-space:nowrap +
 *  text-overflow:ellipsis on the span, flex-shrink:0 on the Stop form so it
 *  never gets squeezed instead) rather than allowed to wrap - a wrapping
 *  banner would have a variable height, and the mobile topbar's offset
 *  below it (`.adminBanner ~ .mobileTopbar` in design-b.module.css) is a
 *  fixed constant that assumes a single line. */
export function AdminViewBanner({ clientName }: { clientName: string }) {
  return (
    <div
      className={styles.adminBanner}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        background: "#1A3F5C", color: "white", fontSize: 13, fontWeight: 600,
        padding: "8px 16px", textAlign: "center",
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        Admin view — viewing as {clientName}
      </span>
      <form method="POST" action="/api/admin/stop-view-as" style={{ margin: 0, flexShrink: 0 }}>
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
