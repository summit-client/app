"use client";

import * as React from "react";
import Link from "next/link";
import { getClients } from "@/lib/data";
import type { ClientRow } from "@/lib/types";

const STATUS_PILL: Record<string, string> = {
  active: "good", intake: "accent", maintenance: "neutral", waitlist: "warn",
};

export default function CaseloadPage() {
  const [clients, setClients] = React.useState<ClientRow[]>([]);
  React.useEffect(() => { void getClients().then(setClients); }, []);

  return (
    <div>
      <h1 className="h-page">My Caseload</h1>
      <p className="sub">Open a client to manage goals and review progress.</p>

      <div className="card table-wrap" style={{ marginTop: 20 }}>
        <table className="data">
          <thead>
            <tr><th scope="col">Client</th><th scope="col">Age</th><th scope="col">Funding</th><th scope="col">Service</th><th scope="col">Goals</th><th scope="col">Status</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td>{c.age ?? "-"}</td>
                <td>{c.funding ?? "-"}</td>
                <td>{c.serviceType ?? "-"}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>
                  {c.activeGoals} active · {c.masteredGoals} mastered
                </td>
                <td><span className={`pill ${STATUS_PILL[c.status] ?? "neutral"}`}>{c.status}</span></td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/clients/${c.id}`} className="btn ghost" style={{ textDecoration: "none" }}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
