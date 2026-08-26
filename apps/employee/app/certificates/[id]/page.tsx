"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getCertificates, getProfile, type Certificate } from "@/lib/hub";

/**
 * Certificate view/print — the approved template, ported 1:1 from the Mount
 * Etna hub (1123×794 landscape): sage corner ribbons, red rosette seal,
 * competency bar, serif titles, signature and academy logo. Print uses
 * A4 landscape with no margins so the art bleeds to the edge.
 */

function fmt(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

/** Decorative layer — the approved template geometry, unchanged. */
function CertArt() {
  const bumps = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2;
    return <circle key={i} cx={(152 + Math.cos(a) * 88).toFixed(1)} cy={(158 + Math.sin(a) * 88).toFixed(1)} r="11" fill="#e01414" />;
  });
  const tl = [[40, 104, "#e3e8de"], [114, 184, "#c2cfba"], [194, 272, "#97ab8e"], [282, 314, "#75886c"]] as const;
  const br = [[30, 74, "#e3e8de"], [84, 130, "#c2cfba"], [140, 186, "#97ab8e"], [196, 220, "#75886c"]] as const;
  const dash = (px: number, py: number, ang: number) =>
    Array.from({ length: 4 }, (_, i) => (
      <rect key={`${px}-${i}`} x={i * 28} y="0" width="17" height="8" fill="#b7bdbe" transform={`translate(${px},${py}) rotate(${ang})`} />
    ));
  return (
    <svg viewBox="0 0 1123 794" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="none" aria-hidden="true">
      <rect width="1123" height="794" fill="#ffffff" />
      <rect x="665" y="0" width="458" height="315" fill="#ccd6c3" />
      {tl.map(([a, b, c]) => <polygon key={`tl${a}`} points={`${a},-40 ${b},-40 -40,${b} -40,${a}`} fill={c} />)}
      {br.map(([a, b, c]) => <polygon key={`br${a}`} points={`${1123 - a},834 ${1123 - b},834 1163,${794 - b} 1163,${794 - a}`} fill={c} />)}
      {dash(250, 10, 45)}
      {dash(10, 250, 45)}
      {dash(1123 - 248, 794 - 18, 225)}
      {dash(1123 - 20, 794 - 246, 225)}
      <circle cx="152" cy="158" r="88" fill="#e01414" />
      {bumps}
      <circle cx="152" cy="158" r="74" fill="none" stroke="#d8d8d8" strokeWidth="2.5" />
      <circle cx="152" cy="158" r="64" fill="none" stroke="#e9e9e9" strokeWidth="2.2" strokeDasharray="0.8,6.2" strokeLinecap="round" />
      <rect x="0" y="590" width="380" height="204" fill="#ccd6c3" />
      <rect x="44" y="616" width="272" height="140" rx="70" fill="#ffffff" />
      <rect x="289" y="258" width="548" height="48" fill="#0c1a0f" />
    </svg>
  );
}

const abs = (style: React.CSSProperties): React.CSSProperties => ({ position: "absolute", textAlign: "center", ...style });

export default function CertificateViewPage() {
  const params = useParams<{ id: string }>();
  const [cert, setCert] = React.useState<Certificate | null | "loading">("loading");
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    setCert(getCertificates().find((c) => c.id === params.id) ?? null);
    setName(getProfile().name);
  }, [params.id]);

  if (cert === "loading") return <p className="sub">Loading certificate…</p>;
  if (!cert) return <p className="sub">Certificate not found.</p>;

  const barText = /^MODULE/i.test(cert.competency) ? cert.competency : "CERTIFICATE";

  return (
    <>
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } .no-print { display: none !important; } body { background: #fff; } .shell aside, .topbar { display: none !important; } .content { padding: 0 !important; max-width: none !important; } .cert-scroll { overflow: visible !important; } } .cert-scroll { overflow-x: auto; }`}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link href="/certificates" className="sub" style={{ color: "var(--accent)" }}>← Back to certificates</Link>
        <button className="btn" onClick={() => window.print()}>Print / save as PDF</button>
      </div>

      <div className="cert-scroll" style={{ paddingTop: 18 }}>
        <div style={{ position: "relative", width: 1123, height: 794, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif", boxShadow: "0 8px 32px rgba(20,40,25,.18)" }}>
          <CertArt />
          <div style={abs({ left: 262, top: 66, width: 600, fontFamily: "Georgia, serif", fontWeight: 800, fontSize: 60, lineHeight: 1.13, color: "#243026", letterSpacing: ".5px" })}>
            CERTIFICATE<br />OF COMPLETION
          </div>
          <div style={{ position: "absolute", left: 289, top: 258, width: 548, height: 48, display: "flex", alignItems: "center", paddingLeft: 28, boxSizing: "border-box", color: "#fff", fontSize: 26, fontWeight: 600 }}>
            {barText}
          </div>
          <div style={abs({ left: 212, top: 330, width: 700, fontSize: 25, color: "#3a3a3a" })}>This certificate of competency issued to</div>
          <div style={abs({ left: 162, top: 384, width: 800, fontFamily: "Georgia, serif", fontSize: 54, fontWeight: 700, color: "#1c2a1f" })}>{name}</div>
          <div style={abs({ left: 292, top: 496, width: 540, fontSize: 22, color: "#3a3a3a" })}>for the completion of</div>
          <div style={abs({ left: 292, top: 534, width: 540, fontSize: 24, fontWeight: 600, color: "#243026", lineHeight: 1.25 })}>{cert.title}</div>
          <div style={abs({ left: 292, top: 612, width: 540, fontSize: 22, color: "#3a3a3a" })}>on this</div>
          <div style={abs({ left: 292, top: 648, width: 540, fontSize: 24, fontWeight: 500, color: "#243026" })}>{fmt(cert.issuedDate)}</div>
          <div style={abs({ left: 292, top: 688, width: 540, fontSize: 13, fontWeight: 600, color: "#8a988a" })}>Certificate no. {cert.certNumber}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/clinical/assets/signature.png" alt="" style={{ position: "absolute", left: 797, bottom: 190, width: 250 }} />
          <div style={{ position: "absolute", left: 792, top: 609, width: 260, height: 2, background: "#222" }} />
          <div style={abs({ left: 772, top: 622, width: 300, fontSize: 16, color: "#333", lineHeight: 1.35 })}>{cert.instructor}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/clinical/assets/megba-logo-card.png" alt="Mount Etna Global Behaviour Academy" style={{ position: "absolute", left: 73, top: 646, width: 215 }} />
        </div>
      </div>
    </>
  );
}
