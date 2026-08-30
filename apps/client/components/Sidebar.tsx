import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { signOutUrl } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type SidebarIconName =
  | "home"
  | "calendar"
  | "progress"
  | "message"
  | "document"
  | "consent"
  | "settings"
  | "logout";

type NavItem = {
  label: string;
  icon: SidebarIconName;
  href?: string;
  comingSoon?: boolean;
};

function SidebarIcon({
  name,
  size = 19,
}: {
  name: SidebarIconName;
  size?: number;
}) {
  const paths: Record<SidebarIconName, React.ReactNode> = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5" />
        <path d="M9.5 20v-6h5v6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
    progress: (
      <>
        <path d="M4 19V9M10 19V5M16 19v-8M22 19H2" />
      </>
    ),
    message: (
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    ),
    document: (
      <>
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M14 2v6h6M9 13h8M9 17h8" />
      </>
    ),
    consent: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: "home", href: "/" },
  { label: "Appointments", icon: "calendar", href: "/appointments" },
  { label: "Progress", icon: "progress", comingSoon: true },
  { label: "Messages", icon: "message", comingSoon: true },
  { label: "Documents", icon: "document", comingSoon: true },
  { label: "Consents", icon: "consent", comingSoon: true },
  { label: "Settings", icon: "settings", comingSoon: true },
];

export default function Sidebar() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // Navigates to apps/web's own signout endpoint rather than calling
  // supabase.auth.signOut() on this app's own client: this client's default
  // cookie writer can only clear a cookie scoped to this host, not the
  // shared `.summitclient.io` cookie every portal reads - see
  // @summit/portals's signOutUrl() for the full reasoning. Calling signOut()
  // here used to look like it worked (this tab cleared, redirected to
  // login) while leaving that shared cookie valid for every other portal.
  function handleLogout() {
    setLoggingOut(true);
    window.location.href = signOutUrl();
  }

  return (
    <aside
      className={styles.sidebar}
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className={styles.brand}>
        <div className={styles.brandMark}>▲</div>

        <div>
          <strong>Summit</strong>
          <span>CLIENT PORTAL</span>
        </div>
      </div>

      <p className={styles.navHeading}>FAMILY PORTAL</p>

      <nav aria-label="Client portal">
        {navItems.map((item) => {
          if (item.comingSoon) {
            return (
              <div
                key={item.label}
                className={styles.navItem}
                aria-disabled="true"
                style={{
                  opacity: 0.45,
                  cursor: "not-allowed",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <SidebarIcon name={item.icon} />
                  <span>{item.label}</span>
                </span>

                <small
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  Soon
                </small>
              </div>
            );
          }

          const active = router.pathname === item.href;

          return (
            <Link
              className={`${styles.navItem} ${
                active ? styles.navItemActive : ""
              }`}
              href={item.href!}
              key={item.href}
              aria-current={active ? "page" : undefined}
            >
              <SidebarIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 20,
        }}
      >
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className={styles.navItem}
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            cursor: loggingOut ? "not-allowed" : "pointer",
            opacity: loggingOut ? 0.6 : 1,
            textAlign: "left",
          }}
        >
          <SidebarIcon name="logout" />
          <span>{loggingOut ? "Logging out..." : "Log out"}</span>
        </button>
      </div>
    </aside>
  );
}
