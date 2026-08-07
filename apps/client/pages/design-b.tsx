import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@summit/db";
import Sidebar from "../components/Sidebar";
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

type Session = {
  id: number;
  client_id: number;
  hour: number | null;
  minute: number | null;
  type: string | null;
  session_date: string;
  status: string | null;
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    progress: <><path d="M4 19V9M10 19V5M16 19v-8M22 19H2"/></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></>,
    document: <><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/></>,
    consent: <><path d="M6 3h12v18H6z"/><path d="m9 12 2 2 4-5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></>,
    announcement: <><path d="M3 11h4l10-5v12l-10-5H3z"/><path d="m7 13 2 7"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
    cloud: <path d="M5 18h13a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 5 18Z"/>,
    bolt: <path d="m13 2-8 12h6l-1 8 9-13h-6z"/>,
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


const metrics: Array<{
  label: string;
  value: string;
  icon: IconName;
  detail: string;
}> = [
  { label: "Sessions", value: "3", icon: "clock", detail: "This week" },
  { label: "Skills", value: "8", icon: "star", detail: "2 new" },
  { label: "Goals", value: "5", icon: "target", detail: "1 nearly done" },
  { label: "Messages", value: "2", icon: "message", detail: "Unread" },
];

export default function DesignB() {
  const [clientName, setClientName] = useState("Ava Bennett");
  const [clientError, setClientError] = useState("");
  const [clientLoading, setClientLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadClient() {
      setClientLoading(true);
      setSessionsLoading(true);
      setClientError("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (authError || !user) {
        console.error("User lookup failed:", authError);
        setClientError("No authenticated user was found.");
        setClientLoading(false);
        setSessionsLoading(false);
        return;
      }

      const { data: client, error: clientQueryError } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (clientQueryError) {
        console.error("Client query failed:", clientQueryError);
        setClientError(clientQueryError.message);
        setClientLoading(false);
        setSessionsLoading(false);
        return;
      }

      if (!client) {
        setClientError("No client is linked to this account.");
        setClientLoading(false);
        setSessionsLoading(false);
        return;
      }

      setClientName(client.name);
      setClientLoading(false);

      const today = new Date().toISOString().split("T")[0];

      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("id, client_id, hour, minute, type, session_date, status")
        .eq("client_id", client.id)
        .gte("session_date", today)
        .order("session_date", { ascending: true })
        .order("hour", { ascending: true })
        .order("minute", { ascending: true })
        .limit(2);

      if (!isMounted) return;

      if (sessionError) {
        console.error("Sessions query failed:", sessionError);
        setClientError(`Sessions error: ${sessionError.message}`);
        setSessionsLoading(false);
        return;
      }

      setSessions(sessionData ?? []);
      setSessionsLoading(false);
    }

    loadClient();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
      <Head>
        <title>Summit Client Portal — Design B</title>
        <meta
          name="description"
          content="Alternative Client Portal dashboard concept"
        />
      </Head>

      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>CLIENT PORTAL</p>
              <h1>Good morning</h1>
              <p className={styles.subtitle}>
                Everything important for {clientName}&apos;s care, at a glance.
              </p>
            </div>

            <div className={styles.headerActions}>
              <button className={styles.iconButton} type="button" aria-label="Notifications">
                <Icon name="bell" />
                <span className={styles.notificationDot}>2</span>
              </button>

              <div className={styles.clientSelect}>
                {clientLoading ? "Loading client..." : clientName}
              </div>
            </div>
          </header>

          {clientError && (
            <p
              style={{
                margin: "0 0 16px",
                padding: "10px 12px",
                color: "#991b1b",
                background: "#fee2e2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              Supabase error: {clientError}
            </p>
          )}

          <section className={styles.metrics} aria-label="Dashboard summary">
            {metrics.map((metric) => (
              <article className={styles.metricCard} key={metric.label}>
                <div className={styles.metricIcon}>
                  <Icon name={metric.icon} />
                </div>
                <div>
                  <div className={styles.metricValue}>
                    {metric.label === "Sessions"
                      ? sessionsLoading
                        ? "—"
                        : String(sessions.length)
                      : metric.value}
                  </div>
                  <div className={styles.metricLabel}>{metric.label}</div>
                </div>
                <span className={styles.metricDetail}>{metric.detail}</span>
              </article>
            ))}
          </section>

          <section className={styles.dashboardGrid}>
            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Upcoming Sessions</h2>
                  <p>Your next appointments</p>
                </div>
                <Link className={styles.textButton} href="/appointments">
                  View all
                </Link>
              </div>

              <div className={styles.sessionList}>
                {sessionsLoading ? (
                  <p style={{ padding: "18px 0", margin: 0 }}>
                    Loading upcoming sessions...
                  </p>
                ) : sessions.length === 0 ? (
                  <p style={{ padding: "18px 0", margin: 0 }}>
                    No upcoming sessions found.
                  </p>
                ) : (
                  sessions.map((session) => {
                    const sessionDate = new Date(
                      `${session.session_date}T00:00:00`
                    );
                    const day = String(sessionDate.getDate()).padStart(2, "0");
                    const month = sessionDate
                      .toLocaleString("en-US", { month: "short" })
                      .toUpperCase();
                    const time = formatSessionTime(
                      session.hour,
                      session.minute
                    );
                    const isVirtual =
                      session.type?.toLowerCase().includes("virtual") ?? false;
                    const statusLabel = isVirtual
                      ? "Virtual"
                      : formatStatus(session.status);

                    return (
                      <div className={styles.sessionRow} key={session.id}>
                        <div className={styles.dateTile}>
                          <strong>{day}</strong>
                          <span>{month}</span>
                        </div>

                        <div className={styles.sessionMain}>
                          <strong>{session.type || "Scheduled Session"}</strong>
                          <div className={styles.sessionMeta}>
                            <span>
                              <Icon name="clock" size={15} />
                              {time}
                            </span>
                            <span>
                              <Icon
                                name={isVirtual ? "video" : "calendar"}
                                size={15}
                              />
                              {isVirtual ? "Virtual" : "Scheduled"}
                            </span>
                          </div>
                          <small>Summit Client</small>
                        </div>

                        <span
                          className={`${styles.status} ${
                            isVirtual ? styles.virtual : styles.confirmed
                          }`}
                        >
                          {statusLabel}
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
                  <p>This month</p>
                </div>
                <button className={styles.textButton} type="button">
                  Details
                </button>
              </div>

              <div className={styles.progressList}>
                <ProgressRow label="Communication" value={75} icon="message" />
                <ProgressRow label="Daily Living" value={60} icon="home" tone="blue" />
                <ProgressRow label="Social Skills" value={45} icon="star" tone="orange" />
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Announcements</h2>
                  <p>Updates from your clinic</p>
                </div>
                <button className={styles.textButton} type="button">
                  View all
                </button>
              </div>

              <div className={styles.announcementList}>
                <div className={styles.announcement}>
                  <div className={styles.announcementIcon}>
                    <Icon name="announcement" />
                  </div>
                  <div>
                    <strong>Summer schedule update</strong>
                    <p>Clinic hours change beginning July 22.</p>
                    <small>2 days ago</small>
                  </div>
                </div>

                <div className={styles.announcement}>
                  <div className={styles.announcementIcon}>
                    <Icon name="document" />
                  </div>
                  <div>
                    <strong>New progress report</strong>
                    <p>Your monthly report is ready.</p>
                    <small>5 days ago</small>
                  </div>
                </div>
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2>Sensory Check-In</h2>
                  <p>How is {clientName} feeling today?</p>
                </div>
              </div>

              <div className={styles.moodGrid}>
                <MoodButton label="Calm" icon="cloud" />
                <MoodButton label="Happy" icon="sun" />
                <MoodButton label="Tired" icon="moon" />
                <MoodButton label="Overwhelmed" icon="bolt" />
              </div>

              <button className={styles.primaryButton} type="button">
                Submit Check-In
              </button>
            </article>
          </section>
        </main>
      </div>
    </>
  );
}

function formatSessionTime(hour: number | null, minute: number | null) {
  if (hour === null) return "Time TBD";

  const safeMinute = minute ?? 0;
  const date = new Date();
  date.setHours(hour, safeMinute, 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatus(status: string | null) {
  if (!status) return "Scheduled";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function ProgressRow({
  label,
  value,
  icon,
  tone = "teal",
}: {
  label: string;
  value: number;
  icon: IconName;
  tone?: "teal" | "blue" | "orange";
}) {
  return (
    <div className={styles.progressRow}>
      <div className={styles.progressTop}>
        <span className={styles.progressLabel}>
          <span className={styles.progressIcon}><Icon name={icon} size={16} /></span>
          {label}
        </span>
        <strong>{value}%</strong>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${styles[tone]}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function MoodButton({ label, icon }: { label: string; icon: IconName }) {
  return (
    <button className={styles.moodButton} type="button">
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}