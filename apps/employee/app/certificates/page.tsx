"use client";

import * as React from "react";
import Link from "next/link";
import { certLifecycle, getCertificates } from "@/lib/hub";

const LIFE_PILL = { ACTIVE: "good", EXPIRING_SOON: "warn", EXPIRED: "danger" } as const;

/** My Certificates: issued certificates with lifecycle status and PDF export.
 * The Module 00 onboarding certificate is auto-issued when onboarding completes. */
export default function CertificatesPage() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading certificates…</p>;

  const certs = getCertificates();

  return (
    <div>
      <h1 className="h-page">My Certificates</h1>
      <p className="sub">
        Certificates are issued automatically. Completing onboarding earns the Module 00 certificate, and training
        modules issue theirs on completion. Each carries a sequential registry number.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {certs.map((c) => {
          const life = certLifecycle(c.expiryDate);
          return (
            <div key={c.id} className="card card-pad" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{c.title}</b>
                  <span className={`pill ${LIFE_PILL[life]}`}>{life.replace(/_/g, " ").toLowerCase()}</span>
                </div>
                <p className="trend" style={{ marginTop: 6 }}>
                  {c.competency} · {c.certNumber} · issued {c.issuedDate}
                  {c.expiryDate ? ` · expires ${c.expiryDate}` : ""} · instructor: {c.instructor}
                </p>
              </div>
              <Link href={`/certificates/${c.id}`} className="btn secondary" style={{ textDecoration: "none", alignSelf: "center" }}>
                View certificate
              </Link>
            </div>
          );
        })}
        {!certs.length ? (
          <div className="card card-pad">
            <p className="sub">No certificates yet. Complete your onboarding to earn the Module 00 certificate.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
