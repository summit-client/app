"use client";

import { HubGate } from "@/components/hub-provider";

import * as React from "react";
import Link from "next/link";
import { addPd, getPd } from "@/lib/hub";
import { classifyPdCertificate, extractPdfText, PD_CATEGORY_LABEL, type PdClassification } from "@/lib/pd-cert";
import {
  CATEGORY_LABEL, computeCompliance, CREDENTIAL_LABEL, maximizeMyCredits, validateAllocation,
  type ContentCategory, type PdActivity,
} from "@/lib/credentials";
import { hr, hrAudit, saveHr } from "@/lib/hr-store";

const CAT_PILL = { BACB_CEU: "accent", CPBAO_CE: "accent", IBAO_CEU: "accent", GENERAL_PD: "neutral" } as const;

/**
 * Professional Development: log entries and upload the certificate PDF.
 * The certificate is read in the browser and classified against BACB / CPBAO /
 * IBAO CEU markers, or marked General PD. Admin verification stays the human
 * authority on every claim.
 */
export default function PdPage() {
  return (
    <HubGate>
      <PdScreen />
    </HubGate>
  );
}

function PdScreen() {
  const [ready, setReady] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [f, setF] = React.useState({ title: "", provider: "", hours: 1, date: new Date().toISOString().slice(0, 10) });
  const [file, setFile] = React.useState<File | null>(null);
  const [reading, setReading] = React.useState(false);
  const [detected, setDetected] = React.useState<PdClassification | null>(null);
  React.useEffect(() => setReady(true), []);
  if (!ready) return <p className="sub">Loading PD…</p>;

  const pd = getPd();
  const total = pd.reduce((s, r) => s + r.hours, 0);
  const ceuTotal = pd.reduce((s, r) => s + (r.ceuUnits ?? 0), 0);

  const onFile = async (picked: File | null) => {
    setFile(picked);
    setDetected(null);
    if (!picked) return;
    setReading(true);
    try {
      const text = await extractPdfText(await picked.arrayBuffer());
      const cls = classifyPdCertificate(text);
      setDetected(cls);
      // prefill hours from detected CEUs (1 CEU = 1 hour convention; editable)
      if (cls.ceuUnits != null && cls.ceuUnits > 0) setF((x) => ({ ...x, hours: cls.ceuUnits! }));
    } catch {
      setDetected({ category: "GENERAL_PD", ceuUnits: null, readable: false, detail: "The file could not be read. Logged as General PD." });
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    await addPd({
      ...f,
      category: detected?.category ?? "GENERAL_PD",
      ceuUnits: detected?.ceuUnits ?? null,
      fileName: file?.name ?? null,
      detection: detected?.detail ?? "No certificate uploaded. Logged as General PD.",
    });
    setF({ title: "", provider: "", hours: 1, date: f.date });
    setFile(null);
    setDetected(null);
    force();
  };

  return (
    <div>
      <h1 className="h-page">Professional Development</h1>
      <p className="sub" style={{ maxWidth: "66ch" }}>
        Log workshops, courses and conference hours, and upload the certificate PDF. It is read on your device and
        classified against BACB, CPBAO and IBAO CEU markers, or marked General PD. An administrator verifies every entry.
      </p>

      <div className="tiles" style={{ marginTop: 16 }}>
        <div className="card tile"><div className="n">{total}</div><div className="l">Total PD hours</div></div>
        <div className="card tile"><div className="n">{ceuTotal}</div><div className="l">Detected CEUs</div></div>
        <div className="card tile"><div className="n">{pd.filter((r) => r.verified).length}</div><div className="l">Verified entries</div></div>
      </div>

      <h2 className="section-title">Add an entry</h2>
      <div className="card card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 240 }}><label htmlFor="pd-title">Title</label>
            <input id="pd-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Ethics in supervision workshop" /></div>
          <div className="field"><label htmlFor="pd-provider">Provider</label>
            <input id="pd-provider" className="input" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /></div>
          <div className="field" style={{ width: 110 }}><label htmlFor="pd-hours">Hours</label>
            <input id="pd-hours" type="number" min={0.5} step={0.5} className="input" value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) || 0 })} /></div>
          <div className="field"><label htmlFor="pd-date">Date</label>
            <input id="pd-date" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="field"><label htmlFor="pd-file">Certificate (PDF)</label>
            <input id="pd-file" type="file" accept="application/pdf" className="input" style={{ padding: 7 }}
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)} /></div>
          {reading ? <span className="sub">Reading certificate…</span> : null}
          {detected ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`pill ${CAT_PILL[detected.category]}`}>{PD_CATEGORY_LABEL[detected.category]}</span>
              {detected.ceuUnits != null ? <span className="pill good">{detected.ceuUnits} CEU</span> : null}
              <span className="sub" style={{ marginTop: 0, maxWidth: "52ch" }}>{detected.detail}</span>
            </div>
          ) : null}
        </div>

        <div>
          <button className="btn" disabled={!f.title.trim() || f.hours <= 0} onClick={() => void save()}>Log PD</button>
        </div>
      </div>

      <CrossCredit />

      <h2 className="section-title">Entries</h2>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Title</th><th>Provider</th><th>Category</th><th>Hours</th><th>CEU</th><th>Date</th><th>Certificate</th><th>Status</th></tr></thead>
          <tbody>
            {pd.map((r) => (
              <tr key={r.id}>
                <td><b>{r.title}</b><div className="trend" style={{ maxWidth: "40ch" }}>{r.detection}</div></td>
                <td>{r.provider || "—"}</td>
                <td><span className={`pill ${CAT_PILL[r.category]}`}>{PD_CATEGORY_LABEL[r.category]}</span></td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.hours}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.ceuUnits ?? "—"}</td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.date}</td>
                <td>{r.fileName ?? "—"}</td>
                <td><span className={`pill ${r.verified ? "good" : "warn"}`}>{r.verified ? "verified" : "awaiting verification"}</span></td>
              </tr>
            ))}
            {!pd.length ? <tr><td colSpan={8} style={{ color: "var(--muted)" }}>No PD logged yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---- cross-credential allocation ------------------------------------------- */

const ALLOCATABLE: ContentCategory[] = ["ETHICS", "SUPERVISION", "CULTURAL_DIVERSITY", "EDI", "SECTION_A", "SECTION_B", "ABA_TOPICS", "GENERAL"];

/**
 * One activity, recorded once, allocated per credential. The engine refuses an
 * allocation that exceeds the activity's unique hours, and refuses category
 * amounts that exceed the allocation where the credential does not permit
 * overlapping categories. CPBAO permits overlap, so the same two hours may
 * satisfy several content categories while still counting as two hours.
 */
function CrossCredit() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const s = hr();
  const [a, setA] = React.useState({ title: "", provider: "", instructor: "", completionDate: new Date().toISOString().slice(0, 10), durationHours: 2, format: "Online", aceProvider: "" });
  const [cats, setCats] = React.useState<ContentCategory[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const compliances = s.credentials.map((c) => computeCompliance(c, s.allocations, s.activities)).filter((x): x is NonNullable<typeof x> => !!x);
  const maximize = maximizeMyCredits(compliances);

  const addActivity = () => {
    const act: PdActivity = {
      id: `act-${Date.now().toString(36)}`,
      ...a,
      aceProvider: a.aceProvider.trim() || null,
      categories: cats,
      certificateFile: null,
      verification: "VERIFICATION_REQUIRED",
      notes: "",
    };
    s.activities.unshift(act);
    // Propose an allocation to every credential whose rule can use this content.
    for (const c of s.credentials) {
      const rule = compliances.find((x) => x.credential.id === c.id)?.rule;
      if (!rule) continue;
      const byCategory: Partial<Record<ContentCategory, number>> = {};
      const overlap = c.credential === "ONT_RBA";
      if (overlap) {
        for (const cat of cats) byCategory[cat] = act.durationHours;
        byCategory.SECTION_B = act.durationHours;
      } else {
        // split the hours across the declared categories: one credit is one category
        const share = cats.length ? act.durationHours / cats.length : 0;
        for (const cat of cats) byCategory[cat] = Math.round(share * 100) / 100;
      }
      const alloc = { activityId: act.id, credentialId: c.id, amount: act.durationHours, byCategory };
      const err = validateAllocation(alloc, act, c);
      if (err) { setError(`${CREDENTIAL_LABEL[c.credential]}: ${err}`); continue; }
      s.allocations.push(alloc);
    }
    saveHr();
    hrAudit("pd.activity_added", `${act.title} (${act.durationHours}h) allocated across ${s.credentials.length} credentials`);
    setA({ ...a, title: "", provider: "", instructor: "", aceProvider: "" });
    setCats([]);
    force();
  };

  return (
    <>
      <h2 className="section-title">Credential activities</h2>
      <p className="sub" style={{ maxWidth: "72ch" }}>
        Record the activity once. Summit allocates it to each credential using that credential&rsquo;s rules, so a two hour
        course stays two hours of activity even when it satisfies several content requirements.
      </p>

      <div className="card card-pad" style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 220 }}><label htmlFor="a-title">Activity title</label>
            <input id="a-title" className="input" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="a-hours">Hours</label>
            <input id="a-hours" type="number" min={0.5} step={0.5} className="input" style={{ width: 100 }} value={a.durationHours}
              onChange={(e) => setA({ ...a, durationHours: Number(e.target.value) || 0 })} /></div>
          <div className="field"><label htmlFor="a-date">Completed</label>
            <input id="a-date" type="date" className="input" value={a.completionDate} onChange={(e) => setA({ ...a, completionDate: e.target.value })} /></div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}><label htmlFor="a-provider">Provider</label>
            <input id="a-provider" className="input" value={a.provider} onChange={(e) => setA({ ...a, provider: e.target.value })} /></div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}><label htmlFor="a-instructor">Instructor</label>
            <input id="a-instructor" className="input" value={a.instructor} onChange={(e) => setA({ ...a, instructor: e.target.value })} /></div>
          <div className="field"><label htmlFor="a-ace">ACE provider number</label>
            <input id="a-ace" className="input" value={a.aceProvider} onChange={(e) => setA({ ...a, aceProvider: e.target.value })} /></div>
        </div>
        <div>
          <span className="sub" style={{ marginTop: 0 }}>Content categories present in this activity</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {ALLOCATABLE.map((c) => (
              <button key={c} className={`mode-tab ${cats.includes(c) ? "active" : ""}`} aria-pressed={cats.includes(c)}
                onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="rule-note">{error}</p> : null}
        <div><button className="btn" onClick={addActivity} disabled={!a.title.trim() || a.durationHours <= 0}>Record activity</button></div>
      </div>

      {s.activities.length ? (
        <div className="card table-wrap" style={{ marginTop: 12 }}>
          <table className="data">
            <thead><tr><th>Activity</th><th>Unique hours</th><th>Allocated to</th><th>Requirements satisfied</th><th>Verification</th></tr></thead>
            <tbody>
              {s.activities.map((act) => {
                const allocs = s.allocations.filter((al) => al.activityId === act.id);
                const satisfied = allocs.reduce((n, al) => n + Object.values(al.byCategory).filter((v) => (v ?? 0) > 0).length, 0);
                return (
                  <tr key={act.id}>
                    <td><b>{act.title}</b><div className="trend">{act.provider} · {act.completionDate}</div></td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{act.durationHours}</td>
                    <td className="trend">{allocs.map((al) => s.credentials.find((c) => c.id === al.credentialId)).filter(Boolean).map((c) => CREDENTIAL_LABEL[c!.credential]).join(", ") || "none"}</td>
                    <td className="trend">{satisfied} requirement{satisfied === 1 ? "" : "s"} across credentials</td>
                    <td><span className={`pill ${act.verification === "VERIFIED" ? "good" : "warn"}`}>{act.verification === "VERIFIED" ? "verified" : "verification required"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="sub">
        Unique activity hours and requirements satisfied are separate numbers by design. See{" "}
        <Link href="/credentials" style={{ color: "var(--accent)" }}>My Credentials</Link> for each cycle.
      </p>
      {maximize.suggestions.length ? <p className="sub" style={{ maxWidth: "72ch" }}>{maximize.suggestions[0]}</p> : null}
    </>
  );
}
