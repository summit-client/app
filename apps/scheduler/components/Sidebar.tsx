import { useRouter } from "next/router";
import { CalendarFeedPanel } from "./CalendarFeedPanel";
import { Icon, type IconName } from "@summit/design/icons";

// Roles are `profiles.role` values — see UserRole in lib/useUser.ts. This
// list used to also admit "staff" (never a real role), then later
// supervisor/clinician/client alongside admin/scheduler for the first three
// items - all unreachable dead configuration at the time, because
// @summit/portals' ACCESS.scheduler was ["admin", "scheduler"] only and
// pages/_app.tsx gates the entire app on that before Sidebar ever renders
// (see lib/explainProblem.ts's ROLE_EXCLUDED case).
//
// 2026-09-02: ACCESS.scheduler now admits "clinician" too (migration 0046 +
// full read parity on every table this portal reads), so "clinician" is
// real here again for the items a clinician actually needs to book,
// reschedule and cancel their own sessions: Dashboard, Calendar, Sessions,
// Create. "employees" (Staff) and "sessiontypes" (Session Types) stay
// admin/scheduler-only deliberately - those are roster/config *management*
// screens, not booking, and 0046's RLS gives clinician no write there at
// all. "clients" and "settings" are unchanged for the same reason.
export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", roles: ["admin", "scheduler", "clinician"] },
  { id: "calendar",  label: "Calendar",  icon: "calendar", roles: ["admin", "scheduler", "clinician"] },
  { id: "sessions",  label: "Sessions",  icon: "session", roles: ["admin", "scheduler", "clinician"] },
  { id: "waitlist",  label: "Waitlist",  icon: "waitlist", roles: ["admin", "scheduler"] },
  { id: "create",    label: "Create",    icon: "recognition", roles: ["admin", "scheduler", "clinician"] },
  { id: "clients",   label: "Clients",   icon: "client", roles: ["admin", "scheduler"] },
  { id: "employees", label: "Staff",     icon: "staff", roles: ["admin", "scheduler"] },
  { id: "sessiontypes", label: "Session Types", icon: "sessionType", roles: ["admin", "scheduler"] },
  // Scheduler sees it read-only (RLS grants insert/update/delete to admin
  // alone), which is still worth having: "which location is this client at"
  // is a scheduling question.
  { id: "locations", label: "Locations", icon: "location", roles: ["admin", "scheduler"] },
  { id: "settings",  label: "Settings",  icon: "settings", roles: ["admin"] },
];

/**
 * The one place that decides which role may reach which view.
 *
 * NAV already filters the *links* (line 149), but the link was never the
 * gate: pages/index.jsx accepts any id in `validViews` straight off
 * `?view=`, so hiding an entry here only hid the entry. Exported so that
 * file can drop an unadmitted view instead of rendering it.
 *
 * An unresolved role returns true deliberately - identity arrives a tick
 * after the first render, and the previous gate (a clinician-only check on
 * `appUser?.role`) behaved the same way. An id NAV does not list also
 * returns true; NAV covers every id in `validViews` today, and a new view
 * should not silently become unreachable by being forgotten here.
 */
export function roleAdmitsView(view: string, role: string | null | undefined): boolean {
  if (!role) return true;
  const entry = NAV.find((n) => n.id === view);
  return entry ? entry.roles.includes(role) : true;
}

interface SidebarProps {
  view: string;
  onNavigate: (id: string) => void;
  appUser: { role: string } | null;
  bookings: { status?: string | null }[];
  calendars: { status: string; name: string }[];
}

export default function Sidebar({ view, onNavigate, appUser, bookings, calendars }: SidebarProps) {
  const router = useRouter();
  const isAdminPage = router.pathname === "/admin";
  // Cancelled sessions are not booked ones. Every other count in this
  // portal filters them out first (index.jsx's activeBookings,
  // sessionsCountFor and liveSessions); this footer did not, so a clinic
  // that cancels anything reads an inflated total under the calendar's
  // name.
  const bookedCount = bookings.filter((b) => b?.status !== "cancelled").length;
  const activeId = isAdminPage ? "admin" : view;

/**
 * Below 820px this sidebar is an off-canvas drawer held open by the
 * `#nav-toggle` checkbox (CLAUDE.md's mobile nav pattern - a checkbox
 * rather than JS so it works inside a Server Component layout). Navigating
 * from inside the drawer changed the view underneath but left the checkbox
 * checked, so the drawer stayed open over the page it had just navigated
 * to and had to be dismissed by hand every time. Nothing else unchecks it:
 * the backdrop and the hamburger are both <label>s for the same input, and
 * neither is involved in a nav click.
 */
function closeMobileDrawer() {
  const toggle = document.getElementById("nav-toggle");
  if (toggle instanceof HTMLInputElement) toggle.checked = false;
}

function handleNav(id: string) {
  closeMobileDrawer();
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
                  display: "inline-flex",
                  alignItems: "center",
                  opacity: active ? 1 : 0.65,
                  color: active ? "var(--brand-600)" : "inherit",
                  transition: "opacity 110ms",
                  lineHeight: 1,
                }}>
                  <Icon name={n.icon as IconName} size={15} />
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
                {bookedCount} session{bookedCount !== 1 ? "s" : ""} booked
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

        {/* "My calendar feed" - personal webcal:// subscription link
            (calendar_feed_tokens, migrations 0044 + 0070). Reachable by any
            signed-in staff role this portal admits, not just admin/scheduler
            - kept in this footer area, additive only, rather than folded
            into the Settings view (admin-only, org-wide settings - wrong fit
            both on access and on meaning for a personal link). */}
        <CalendarFeedPanel />
      </div>
    </aside>
  );
}
