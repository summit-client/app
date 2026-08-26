"use client";

import * as React from "react";
import { certLifecycle, getCertificates } from "@/lib/hub";
import { PdfExport, PrintSection } from "@/components/pdf-export";

const LIFE_PILL = { ACTIVE: "good", EXPIRING_SOON: "warn", EXPIRED: "danger" } as const;

/** My Certificates — issued certificates with lifecycle status and PDF export.
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
        Certificates are issued automatically — completing onboarding earns the Module 00 certificate, and training
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
              <PdfExport title="Certificate of Completion" subtitle={`${c.title} · ${c.certNumber}`} authors={[c.instructor]}>
                <div style={{ textAlign: "center", padding: "24pt 0" }}>
                  <p style={{ fontSize: "10pt", letterSpacing: "0.2em", textTransform: "uppercase" }}>This certifies that</p>
                  <p style={{ fontSize: "20pt", fontWeight: 700, margin: "8pt 0" }}>the named employee</p>
                  <p style={{ fontSize: "10pt" }}>has successfully completed</p>
                  <p style={{ fontSize: "15pt", fontWeight: 700, margin: "8pt 0" }}>{c.title}</p>
                  <p style={{ fontSize: "10.5pt" }}>{c.competency}</p>
                </div>
                <PrintSection heading="Registry" text={`Certificate number: ${c.certNumber}\nIssued: ${c.issuedDate}${c.expiryDate ? `\nExpires: ${c.expiryDate}` : ""}\nInstructor: ${c.instructor}`} />
              </PdfExport>
            </div>
          );
        })}
        {!certs.length ? (
          <div className="card card-pad">
            <p className="sub">No certificates yet — complete your onboarding to earn the Module 00 certificate.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
