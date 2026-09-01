import { useRouter } from "next/router";

// Roles are `profiles.role` values — see UserRole in lib/useUser.ts. This
// list used to also admit "staff" (never a real role), then later
// supervisor/clinician/client alongside admin/scheduler for the first three
// items - all now unreachable dead configuration: @summit/portals'
// ACCESS.scheduler is ["admin", "scheduler"] only, and pages/_app.tsx gates
// the entire app on that before Sidebar ever renders (see
// lib/explainProblem.ts's ROLE_EXCLUDED case). Every item here is
// admin/scheduler by definition now; only "settings" narrows further.
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "▦", roles: ["admin", "scheduler"] },
  { id: "calendar",  label: "Calendar",  icon: "⊞", roles: ["admin", "scheduler"] },
  { id: "sessions",  label: "Sessions",  icon: "◈", roles: ["admin", "scheduler"] },
  { id: "clients",   label: "Clients",   icon: "⊙", roles: ["admin", "scheduler"] },
  { id: "employees", label: "Staff",     icon: "◎", roles: ["admin", "scheduler"] },
  { id: "sessiontypes", label: "Session Types", icon: "◈", roles: ["admin", "scheduler"] },
  { id: "create",    label: "Create",    icon: "✦", roles: ["admin", "scheduler"] },
  { id: "settings",  label: "Settings",  icon: "⚙", roles: ["admin"] },
];

interface SidebarProps {
  view: string;
  onNavigate: (id: string) => void;
  appUser: { role: string } | null;
  bookings: unknown[];
  calendars: { status: string; name: string }[];
}

export default function Sidebar({ view, onNavigate, appUser, bookings, calendars }: SidebarProps) {
  const router = useRouter();
  const isAdminPage = router.pathname === "/admin";
  const activeId = isAdminPage ? "admin" : view;

function handleNav(id: string) {
  if (isAdminPage) {
    if (id === "settings") return;
    router.push({ pathname: "/", query: { view: id } });
  } else {
    onNavigate(id);
  }
}

  const activeCalendar = calendars.find(c => c.status === "active");

  return (
    // "scheduler-sidebar" - the mobile drawer treatment for this fixed
    // 228px-wide column lives in globals.css (@media max-width:820px). Below
    // that breakpoint it was previously just a permanent 228px-wide column
    // eating well over half of a phone screen, with nothing making it
    // collapse or open on demand.
    <aside className="scheduler-sidebar" style={{
      width: 228,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      background: "var(--color-background-secondary)",
      borderRight: "1px solid var(--color-border-tertiary)",
      padding: "0",
    }}>

      {/* Logo area */}
      <div style={{
        padding: "24px 20px 20px",
        borderBottom: "1px solid var(--color-border-tertiary)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* The real Summit mark. This was three flat polygons approximating
              peaks, a placeholder from before the asset existed. Same file the
              marketing header and the other three portals use, so all five
              surfaces finally show one logo. Sized explicitly so the sidebar
              does not shift while it loads. */}
          <img
            src="/summit-mark-64.png"
            alt=""
            width={28}
            height={28}
            style={{ display: "block", flexShrink: 0 }}
          />
          <div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-md)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}>
              Summit
            </div>
            <div style={{
              fontSize: "var(--text-2xs)",
              color: "var(--color-text-tertiary)",
              fontWeight: 400,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginTop: 1,
            }}>
              Scheduler
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>

        {/* Group label */}
        <div style={{
          fontSize: "var(--text-2xs)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-text-tertiary)",
          padding: "4px 8px 6px",
        }}>
          Workspace
        </div>
        {NAV.filter(n => appUser && n.roles.includes(appUser.role)).map((n, i) => {
          const activeId = isAdminPage ? "settings" : view;
          const active = activeId === n.id;
          const isCreate = n.id === "create";
          const isAdmin = n.id === "settings";
          
          // Visual separator before Admin
          const prevItem = NAV.filter(x => appUser && x.roles.includes(appUser.role))[i - 1];
          const showDivider = isAdmin && prevItem;

          return (
            <div key={n.id}>
              {showDivider && (
                <div style={{
                  height: 1,
                  background: "var(--color-border-tertiary)",
                  margin: "6px 8px",
                }} />
              )}
              <button
                onClick={() => handleNav(n.id)}
                className={`nav-item${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
                style={{ position: "relative" }}
              >
                <span style={{
                  fontSize: 14,
                  opacity: active ? 1 : 0.65,
                  color: active ? "var(--brand-600)" : "inherit",
                  transition: "opacity 110ms",
                  lineHeight: 1,
                }}>
                  {n.icon}
                </span>
                <span style={{ flex: 1 }}>{n.label}</span>
                {isCreate && (
                  <span style={{
                    fontSize: "var(--text-2xs)",
                    padding: "2px 7px",
                    borderRadius: "var(--radius-full)",
                    background: "oklch(64% 0.135 188 / 0.15)",
                    color: "var(--brand-600)",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}>
                    AI
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Footer stats */}
      <div style={{
        padding: "14px 18px 18px",
        borderTop: "1px solid var(--color-border-tertiary)",
      }}>
        {activeCalendar ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--brand-50)",
            border: "1px solid var(--brand-100)",
          }}>
            <div style={{
              width: 7, height: 7,
              borderRadius: "var(--radius-full)",
              background: "var(--color-success)",
              flexShrink: 0,
            }} />
            <div>
              <div style={{
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                color: "var(--brand-700)",
                lineHeight: 1.3,
              }}>
                {activeCalendar.name}
              </div>
              <div style={{
                fontSize: "var(--text-2xs)",
                color: "var(--color-text-tertiary)",
                marginTop: 1,
              }}>
                {bookings.length} session{bookings.length !== 1 ? "s" : ""} booked
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-tertiary)",
            padding: "4px 4px",
          }}>
            No active calendar
          </div>
        )}
      </div>
    </aside>
  );
}
