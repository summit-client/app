import { useState } from "react";
import Sidebar from "../components/Sidebar";
import styles from "../styles/design-b.module.css";

type Session = {
  id: number;
  date: string;
  time: string;
  type: string;
  clinician: string;
  location: string;
  status: "Upcoming" | "Completed" | "Virtual";
};

const sessions: Session[] = [
  {
    id: 1,
    date: "Aug 10",
    time: "10:00 AM",
    type: "Direct Therapy",
    clinician: "Rachel Kim",
    location: "Main Clinic",
    status: "Upcoming",
  },
  {
    id: 2,
    date: "Aug 12",
    time: "1:30 PM",
    type: "Assessment",
    clinician: "Dr. Sarah Chen",
    location: "Virtual",
    status: "Virtual",
  },
  {
    id: 3,
    date: "Aug 14",
    time: "11:00 AM",
    type: "Direct Therapy",
    clinician: "Rachel Kim",
    location: "Main Clinic",
    status: "Upcoming",
  },
  {
    id: 4,
    date: "Aug 03",
    time: "9:30 AM",
    type: "Assessment",
    clinician: "Dr. Sarah Chen",
    location: "Main Clinic",
    status: "Completed",
  },
  {
    id: 5,
    date: "Jul 29",
    time: "2:00 PM",
    type: "Direct Therapy",
    clinician: "Rachel Kim",
    location: "Virtual",
    status: "Completed",
  },
  {
    id: 6,
    date: "Aug 16",
    time: "3:00 PM",
    type: "RBA Supervision",
    clinician: "Jordan Lee",
    location: "Virtual",
    status: "Virtual",
  },
];

export default function Appointments() {
  const [filter, setFilter] = useState<
    "All" | "Upcoming" | "Completed" | "Virtual"
  >("All");

  const filteredSessions =
    filter === "All"
      ? sessions
      : sessions.filter((session) => session.status === filter);

  return (
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
          <h1 style={{ margin: "0 0 6px", color: "#173f5f" }}>
            Appointments
          </h1>
          <p style={{ margin: 0, color: "#6c8290" }}>
            View and filter upcoming and past sessions.
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
          {(["All", "Upcoming", "Completed", "Virtual"] as const).map(
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
                  background: filter === option ? "#173f5f" : "#ffffff",
                  color: filter === option ? "#ffffff" : "#365468",
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
          {filteredSessions.map((session) => (
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
                  {session.type}
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
                    {session.date} · {session.time}
                  </span>
                  <span>
                    {session.clinician} · {session.location}
                  </span>
                </div>
              </div>

              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background:
                    session.status === "Completed"
                      ? "#e8edf0"
                      : session.status === "Virtual"
                      ? "#e0eef8"
                      : "#dff6eb",
                  color:
                    session.status === "Completed"
                      ? "#60717b"
                      : session.status === "Virtual"
                      ? "#2d6f9b"
                      : "#237960",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {session.status}
              </span>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
