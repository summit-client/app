import Head from "next/head";
import Link from "next/link";
import Sidebar from "./Sidebar";
import { MobileNavChrome } from "./mobile-nav-chrome";
import styles from "../styles/design-b.module.css";

type IconName =
  | "home"
  | "calendar"
  | "progress"
  | "message"
  | "document"
  | "consent"
  | "settings"
  | "clock"
  | "star"
  | "target"
  | "bell"
  | "location"
  | "video"
  | "announcement"
  | "sun"
  | "moon"
  | "cloud"
  | "bolt";

export type DashboardSession = {
  id: number;
  hour: number | null;
  minute: number | null;
  type: string | null;
  session_date: string;
  status: string | null;
};

type DesignBProps = {
  familyName: string;
  clientName: string;
  sessions: DashboardSession[];
};

function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  const paths: Record<IconName, React.ReactNode> = {
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
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" />
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    video: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m16 10 5-3v10l-5-3" />
      </>
    ),
    announcement: (
      <>
        <path d="M3 11h4l10-5v12l-10-5H3z" />
        <path d="m7 13 2 7" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: (
      <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
    ),
    cloud: (
      <path d="M5 18h13a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 5 18Z" />
    ),
    bolt: <path d="m13 2-8 12h6l-1 8 9-13h-6z" />,
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

export default function DesignB({
  familyName,
  clientName,
  sessions,
}: DesignBProps) {
  return (
    <>
      <Head>
        <title>Summit Client Portal</title>
        <meta
          name="description"
          content="Summit Client Portal dashboard"
        />
      </Head>

      <MobileNavChrome title="Summit" />

      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>CLIENT PORTAL</p>

              <h1>Welcome, {familyName}</h1>

              <p className={styles.subtitle}>
                View {clientName}&apos;s current care information.
              </p>
            </div>

            <div className={styles.headerActions}>
              <div className={styles.clientSelect}>
                {clientName}
              </div>
            </div>
          </header>

          <section
            className={styles.metrics}
            aria-label="Dashboard summary"
          >
            <article className={styles.metricCard}>
              <div className={styles.metricIcon}>
                <Icon name="clock" />
              </div>

              <div>
                <div className={styles.metricValue}>
                  {sessions.length}
                </div>

                <div className={styles.metricLabel}>
                  Sessions
                </div>
              </div>

              <span className={styles.metricDetail}>
                Upcoming
              </span>
            </article>

            <ComingSoonMetric
              label="Skills"
              icon="star"
            />

            <ComingSoonMetric
              label="Goals"
              icon="target"
            />

            <ComingSoonMetric
              label="Messages"
              icon="message"
            />
          </section>

          <section className={styles.dashboardGrid}>
            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Upcoming Sessions</h2>
                  <p>Your scheduled appointments</p>
                </div>

                <Link
                  className={styles.textButton}
                  href="/appointments"
                >
                  View all
                </Link>
              </div>

              <div className={styles.sessionList}>
                {sessions.length === 0 ? (
                  <div
                    style={{
                      padding: "20px 0",
                      color: "#607987",
                    }}
                  >
                    No appointments scheduled.
                  </div>
                ) : (
                  sessions.map((session) => {
                    const { day, month } =
                      formatSessionDate(
                        session.session_date
                      );

                    const time = formatSessionTime(
                      session.hour,
                      session.minute
                    );

                    return (
                      <div
                        className={styles.sessionRow}
                        key={session.id}
                      >
                        <div className={styles.dateTile}>
                          <strong>{day}</strong>
                          <span>{month}</span>
                        </div>

                        <div className={styles.sessionMain}>
                          <strong>
                            {session.type ||
                              "Scheduled Session"}
                          </strong>

                          <div
                            className={
                              styles.sessionMeta
                            }
                          >
                            <span>
                              <Icon
                                name="clock"
                                size={15}
                              />
                              {time}
                            </span>

                            <span>
                              <Icon
                                name="calendar"
                                size={15}
                              />
                              {formatStatus(
                                session.status
                              )}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`${styles.status} ${
                            styles[statusClass(session.status)]
                          }`}
                        >
                          {formatStatus(
                            session.status
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Progress Snapshot</h2>
                  <p>Progress information</p>
                </div>
              </div>

              <EmptyState
                title="Progress coming soon"
                message="Progress information is not available in the client portal yet."
              />
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Announcements</h2>
                  <p>Updates from your clinic</p>
                </div>
              </div>

              <EmptyState
                title="No announcements"
                message="There are no announcements available right now."
              />
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Sensory Check-In</h2>
                  <p>
                    Check-in tools are coming soon.
                  </p>
                </div>
              </div>

              <div className={styles.cardBody}>
                <p>
                  Sensory check-in is not available yet.
                </p>
              </div>
            </article>
          </section>
        </main>
      </div>
    </>
  );
}

function ComingSoonMetric({
  label,
  icon,
}: {
  label: string;
  icon: IconName;
}) {
  return (
    <article className={styles.metricCard}>
      <div className={styles.metricIcon}>
        <Icon name={icon} />
      </div>

      <div>
        <div className={styles.metricValue}>—</div>

        <div className={styles.metricLabel}>
          {label}
        </div>
      </div>

      <span className={styles.metricDetail}>
        Coming soon
      </span>
    </article>
  );
}

function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className={styles.cardBody}>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

function formatSessionDate(date: string) {
  const [year, month, day] = date
    .split("-")
    .map(Number);

  if (!year || !month || !day) {
    return {
      day: "--",
      month: "---",
    };
  }

  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];

  return {
    day: String(day).padStart(2, "0"),
    month: months[month - 1],
  };
}

function formatSessionTime(
  hour: number | null,
  minute: number | null
) {
  if (hour === null) {
    return "Time TBD";
  }

  const safeMinute = minute ?? 0;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(
    safeMinute
  ).padStart(2, "0")} ${period}`;
}

function statusClass(status: string | null) {
  switch (status?.toLowerCase()) {
    case "cancelled":
      return "cancelled";
    case "completed":
      return "completed";
    default:
      return "confirmed";
  }
}

function formatStatus(status: string | null) {
  if (!status) {
    return "Scheduled";
  }

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}