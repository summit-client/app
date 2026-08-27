"use client";

import { HubGate } from "@/components/hub-provider";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSetting } from "@summit/settings";
import { getCertificates, getProfile, type Certificate } from "@/lib/hub";

/**
 * Certificate view and print: the Summit credential template (blue formal),
 * white ground, diagonal blue ribbon bands, the Summit badge, Playfair
 * Display titles and Public Sans body. Unsigned: the credential carries the
 * registry number and the issuing organization, not a personal signature.
 * A4 landscape full-bleed on print.
 */

function fmt(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

/** Diagonal ribbon art echoing the approved blue formal background. */
function RibbonArt() {
  const bands = [
    // [offset, width, fill]: diagonal bands at 45 degrees sweeping the top-right
    [430, 46, "url(#g1)"], [510, 14, "#cfe0e8"], [556, 30, "url(#g2)"], [620, 10, "#d7dbde"],
    [664, 40, "url(#g1)"], [740, 16, "#9fc4d2"], [788, 26, "url(#g3)"], [850, 8, "#d7dbde"],
  ] as const;
  const dashes = (x0: number, y0: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <rect key={i} x={x0 + i * 26} y={y0} width="15" height="7" fill="#b9c6cd" transform={`rotate(-45 ${x0 + i * 26} ${y0})`} />
    ));
  return (
    <svg viewBox="0 0 1123 794" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e9db4" /><stop offset="1" stopColor="#14364f" />
        </linearGradient>
        <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#57b6c6" /><stop offset="1" stopColor="#1d5f7e" />
        </linearGradient>
        <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6b8ca3" /><stop offset="1" stopColor="#26506b" />
        </linearGradient>
      </defs>
      <rect width="1123" height="794" fill="#ffffff" />
      {/* top-right sweep */}
      <g transform="rotate(-45 1123 0)">
        {bands.map(([o, w, f]) => (
          <rect key={`t${o}`} x={1123 - 900} y={-o - w} width="1400" height={w} fill={f} transform={`translate(0 ${-140})`} />
        ))}
      </g>
      {/* bottom-left echo */}
      <g transform="rotate(-45 0 794)" opacity="0.85">
        {bands.slice(0, 4).map(([o, w, f]) => (
          <rect key={`b${o}`} x={-700} y={794 + o * 0.35} width="1100" height={w * 0.7} fill={f} />
        ))}
      </g>
      {dashes(880, 240)}
      {dashes(150, 700)}
    </svg>
  );
}

const abs = (style: React.CSSProperties): React.CSSProperties => ({ position: "absolute", textAlign: "center", ...style });
const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"Public Sans", Inter, system-ui, sans-serif';

export default function CertificateViewPage() {
  return (
    <HubGate>
      <CertificateViewScreen />
    </HubGate>
  );
}

function CertificateViewScreen() {
  const params = useParams<{ id: string }>();
  const [cert, setCert] = React.useState<Certificate | null | "loading">("loading");
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    setCert(getCertificates().find((c) => c.id === params.id) ?? null);
    setName(getProfile().name);
  }, [params.id]);

  if (cert === "loading") return <p className="sub">Loading certificate…</p>;
  if (!cert) return <p className="sub">Certificate not found.</p>;

  const orgName = String(getSetting("org.name"));

  return (
    <>
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } .no-print { display: none !important; } body { background: #fff; } .shell aside, nav[aria-label="Summit portals"] { display: none !important; } .content { padding: 0 !important; max-width: none !important; } .cert-scroll { overflow: visible !important; } } .cert-scroll { overflow-x: auto; }`}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link href="/certificates" className="sub" style={{ color: "var(--accent)" }}>← Back to certificates</Link>
        <button className="btn" onClick={() => window.print()}>Print / save as PDF</button>
      </div>

      <div className="cert-scroll" style={{ paddingTop: 18 }}>
        <div style={{ position: "relative", width: 1123, height: 794, margin: "0 auto", fontFamily: SANS, boxShadow: "0 8px 32px rgba(15,40,55,.2)", color: "#22333f" }}>
          <RibbonArt />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/summit-badge.png" alt="Summit" style={{ position: "absolute", left: 74, top: 44, width: 190 }} />

          <div style={abs({ left: 212, top: 96, width: 700, fontFamily: SERIF, fontWeight: 800, fontSize: 58, lineHeight: 1.12, color: "#14364f", letterSpacing: ".5px" })}>
            CERTIFICATE<br />OF COMPLETION
          </div>

          <div style={{ position: "absolute", left: 288, top: 276, width: 548, height: 48, background: "#14364f", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, fontWeight: 600, letterSpacing: "0.14em" }}>
            SUMMIT CREDENTIAL
          </div>
          <div style={abs({ left: 288, top: 332, width: 548, fontSize: 14, fontWeight: 600, letterSpacing: "0.1em", color: "#4d6b7d" })}>
            {cert.competency}
          </div>

          <div style={abs({ left: 212, top: 386, width: 700, fontSize: 23, color: "#3a4a56" })}>This certificate of completion is issued to</div>
          <div style={abs({ left: 112, top: 428, width: 900, fontFamily: SERIF, fontSize: 52, fontWeight: 700, color: "#10293c" })}>{name}</div>

          <div style={abs({ left: 212, top: 528, width: 700, fontSize: 21, color: "#3a4a56" })}>for the completion of</div>
          <div style={abs({ left: 162, top: 564, width: 800, fontSize: 25, fontWeight: 600, color: "#14364f", lineHeight: 1.25 })}>{cert.title}</div>

          <div style={abs({ left: 212, top: 634, width: 700, fontSize: 20, color: "#3a4a56" })}>on this {fmt(cert.issuedDate)}</div>

          <div style={abs({ left: 212, top: 700, width: 700, fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", color: "#7b8f9c" })}>
            Certificate no. {cert.certNumber} · Issued by {orgName} · Powered by SummitClient.io
          </div>
        </div>
      </div>
    </>
  );
}
