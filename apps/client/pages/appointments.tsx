import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { createClient } from "../lib/supabase-server";
import { resolveViewedClient } from "../lib/admin-view-as";
import { AdminViewBanner } from "../components/admin-view-banner";
import { AccountProblemNotice } from "../components/account-problem-notice";
import type { AccountProblem } from "../lib/explain-account-problem";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type SessionStatus = "scheduled" | "completed" | "cancelled";

type Session = {
  id: number;
  session_date: string;
  hour: number | null;
  minute: number | null;
  type: string | null;
  status: string | null;
  staff: {
    name: string | null;
  }[];
};

type PageProps =
  | {
      mode: "appointments";
      sessions: Session[];
      clientName: string;
      isAdminViewingAs: boolean;
    }
  | { mode: "problem"; problem: AccountProblem };

type Filter = "All" | "Scheduled" | "Completed" | "Cancelled";

export default function Appointments(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const [filter, setFilter] = useState<Filter>("All");

  if (props.mode === "problem") {
    return <AccountProblemNotice problem={props.problem} />;
  }

  const { sessions, clientName, isAdminViewingAs } = props;

  const filteredSessions =
    filter === "All"
      ? sessions
      : sessions.filter(
          (session) => normalizeStatus(session.status) === filter.toLowerCase()
        );

  return (
    <>
    {isAdminViewingAs ? <AdminViewBanner clientName={clientName} /> : null}
    <MobileNavChrome title="Appointments" />
    <div className={styles.page}>
      <Sidebar />

      <main
        className={styles.main}
        style={{
          background: "#edf7f8",
          minHeight: "100vh",
        }}
      >
        <header style={{ marginBottom: 24 }}>
          <p className={styles.eyebrow}>CLIENT PORTAL</p>

          <h1
            style={{
              margin: "0 0 6px",
              color: "#173f5f",
            }}
          >
            Appointments
          </h1>

          <p
            style={{
              margin: 0,
              color: "#6c8290",
            }}
          >
            View your scheduled and past sessions.
          </p>
        </header>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {(["All", "Scheduled", "Completed", "Cancelled"] as const).map(
            (option) => (
              <button
                key={option}
                onClick={() => setFilter(option)}
                type="button"
                style={{
                  padding: "9px 14px",
                  borderRadius: 10,
                  border:
                    filter === option
                      ? "1px solid #173f5f"
                      : "1px solid #cddde4",
                  background:
                    filter === option ? "#173f5f" : "#ffffff",
                  color:
                    filter === option ? "#ffffff" : "#365468",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {option}
              </button>
            )
          )}
        </div>

        <section
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          {filteredSessions.length === 0 ? (
            <div
              style={{
                padding: 24,
                background: "#ffffff",
                border: "1px solid #d4e2e8",
                borderRadius: 14,
                color: "#607987",
              }}
            >
              No appointments scheduled.
            </div>
          ) : (
            filteredSessions.map((session) => {
              const status = normalizeStatus(session.status);
              const clinicianName = session.staff?.[0]?.name;

              return (
                <article
                  key={session.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 16,
                    alignItems: "center",
                    padding: 18,
                    background: "#ffffff",
                    border: "1px solid #d4e2e8",
                    borderRadius: 14,
                    boxShadow: "0 8px 24px rgba(20, 60, 80, 0.04)",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display: "block",
                        marginBottom: 6,
                        color: "#173247",
                        fontSize: 15,
                      }}
                    >
                      {session.type || "Session"}
                    </strong>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 12,
                        color: "#607987",
                        fontSize: 12,
                      }}
                    >
                      <span>
                        {formatSessionDate(session.session_date)} ·{" "}
                        {formatSessionTime(session.hour, session.minute)}
                      </span>

                      {clinicianName && <span>{clinicianName}</span>}
                    </div>
                  </div>

                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      background:
                        status === "completed"
                          ? "#e8edf0"
                          : status === "cancelled"
                          ? "#fbe9e7"
                          : "#dff6eb",
                      color:
                        status === "completed"
                          ? "#60717b"
                          : status === "cancelled"
                          ? "#a14b43"
                          : "#237960",
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "capitalize",
                    }}
                  >
                    {status}
                  </span>
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({
  req,
  res,
}) => {
  const supabase = createClient(
    req as NextApiRequest,
    res as NextApiResponse
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      redirect: {
        destination:
          process.env.NEXT_PUBLIC_LOGIN_URL ||
          "https://summitclient.io/login",
        permanent: false,
      },
    };
  }

  const resolved = await resolveViewedClient(supabase, req as NextApiRequest, user.id);

  if (resolved.kind === "needs-selection") {
    // The picker lives on the landing page, not here.
    return { redirect: { destination: "/", permanent: false } };
  }
  if (resolved.kind === "account-problem") {
    return { props: { mode: "problem", problem: resolved.problem } };
  }
  if (resolved.kind === "not-permitted") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return { redirect: { destination: homeUrlFor(profile?.role), permanent: false } };
  }

  const { viewed } = resolved;

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select(`
      id,
      session_date,
      hour,
      minute,
      type,
      status,
      staff (
        name
      )
    `)
    .eq("client_id", viewed.clientId)
    .order("session_date", { ascending: true })
    .order("hour", { ascending: true })
    .order("minute", { ascending: true });

  if (sessionsError) {
    console.error("Failed to load appointments:", sessionsError.message);

    return {
      props: {
        mode: "appointments",
        sessions: [],
        clientName: viewed.clientName,
        isAdminViewingAs: viewed.isAdminViewingAs,
      },
    };
  }

  return {
    props: {
      mode: "appointments",
      sessions: (sessions ?? []) as Session[],
      clientName: viewed.clientName,
      isAdminViewingAs: viewed.isAdminViewingAs,
    },
  };
};

function normalizeStatus(status: string | null): SessionStatus {
  const normalized = status?.toLowerCase();

  if (normalized === "completed") {
    return "completed";
  }

  if (normalized === "cancelled") {
    return "cancelled";
  }

  return "scheduled";
}

function formatSessionDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return date;
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${monthNames[month - 1]} ${day}`;
}

function formatSessionTime(
  hour: number | null,
  minute: number | null
) {
  if (hour === null) {
    return "Time not set";
  }

  const safeMinute = minute ?? 0;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(safeMinute).padStart(
    2,
    "0"
  )} ${period}`;
}
