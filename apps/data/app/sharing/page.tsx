"use client";

import * as React from "react";
import {
  RECORD_TYPE_LABEL, VISIBILITY_OPTIONS, getGrants, getGuardiansFor,
  getShareableRecords, needsAttention, permissionFor, setGrant, setVisibility,
  visibilitySummary,
  type GuardianOption, type ShareableRecord, type Visibility,
} from "@/lib/visibility";

/**
 * What families see.
 *
 * One screen rather than a control buried on each record, because the question
 * a supervisor actually has is "what is this family able to read", and that is
 * not answerable by opening documents one at a time.
 *
 * Records needing a decision sort to the top. `specific` with nobody named is
 * the state worth surfacing: it is one click away, it reads like sharing in any
 * list that prints only the label, and it means no family member can see the
 * record at all.
 *
 * Nothing here decides who may change a visibility. Migration 0069 gates that
 * on `clinical.record.share`; a clinician's update matches no rows and a
 * clinician's note update raises. This page shows the control to everyone and
 * reports what the database said, rather than hiding it and guessing - a
 * hidden control teaches nobody why they cannot use it.
 */
export default function SharingPage() {
  const [records, setRecords] = React.useState<ShareableRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [guardians, setGuardians] = React.useState<GuardianOption[]>([]);
  const [granted, setGranted] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setRecords(await getShareableRecords()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load records."); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const open = records.find((r) => r.recordId === openId) ?? null;

  const openRecord = React.useCallback(async (r: ShareableRecord) => {
    setOpenId(r.recordId);
    setNotice(null);
    if (r.clientId == null) { setGuardians([]); setGranted(new Set()); return; }
    try {
      const [g, current] = await Promise.all([
        getGuardiansFor(r.clientId, permissionFor(r.recordType)),
        getGrants(r.recordType, r.recordId),
      ]);
      setGuardians(g);
      setGranted(new Set(current));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't load the family record.");
    }
  }, []);

  async function choose(r: ShareableRecord, v: Visibility) {
    setBusy(true); setNotice(null);
    try {
      await setVisibility(r.recordType, r.recordId, v);
      await load();
      if (v === "specific") await openRecord({ ...r, visibility: v });
    } catch (e) {
      // The database refuses this for anyone without clinical.record.share.
      // Saying which role can do it is more useful than "permission denied",
      // because the next step is asking one of them.
      setNotice(e instanceof Error
        ? `That didn't save. ${e.message}`
        : "Only an admin or supervisor can change what a family sees.");
    } finally { setBusy(false); }
  }

  async function toggleGuardian(r: ShareableRecord, g: GuardianOption, on: boolean) {
    setBusy(true); setNotice(null);
    try {
      await setGrant(r.recordType, r.recordId, r.clinicId, g.userId, on);
      const next = new Set(granted);
      if (on) next.add(g.userId); else next.delete(g.userId);
      setGranted(next);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? `That didn't save. ${e.message}` : "That didn't save.");
    } finally { setBusy(false); }
  }

  // Records still needing a decision first, then the rest.
  const ordered = [...records].sort((a, b) => {
    const na = needsAttention(a) ? 0 : 1, nb = needsAttention(b) ? 0 : 1;
    if (na !== nb) return na - nb;
    return (a.clientName ?? "").localeCompare(b.clientName ?? "");
  });
  const attention = ordered.filter(needsAttention).length;

  return (
    <main style={{ padding: "28px 32px", maxWidth: 1100 }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>What families see</h1>
        <p style={{ margin: 0, color: "var(--muted, #667085)", maxWidth: 640 }}>
          Every record a family could read, and who can read it. Changing this
          needs an admin or supervisor.
        </p>
      </header>

      {error ? (
        <div role="alert" style={notice_style}>
          {error}{" "}
          <button onClick={() => void load()} style={linkButton}>Try again</button>
        </div>
      ) : null}

      {attention > 0 ? (
        <div style={{ ...notice_style, background: "#fff8e6", borderColor: "#f0c36d" }}>
          {attention === 1
            ? "One record is set to named guardians with nobody named, so no family member can see it."
            : `${attention} records are set to named guardians with nobody named, so no family member can see them.`}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: "var(--muted, #667085)" }}>Loading…</p>
      ) : ordered.length === 0 ? (
        <div style={emptyBox}>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Nothing to review yet.</p>
          <p style={{ margin: 0, color: "var(--muted, #667085)" }}>
            Documents and milestones appear here once they exist.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {ordered.map((r) => {
            const isOpen = r.recordId === openId;
            return (
              <li key={`${r.recordType}:${r.recordId}`} style={row}>
                <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                    <p style={{ margin: "0 0 3px", fontWeight: 600 }}>{r.label}</p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #667085)" }}>
                      {RECORD_TYPE_LABEL[r.recordType]}
                      {r.clientName ? ` · ${r.clientName}` : ""}
                      {r.setByName ? ` · last changed by ${r.setByName}` : ""}
                    </p>
                  </div>
                  <p style={{
                    margin: 0, fontSize: 13,
                    color: needsAttention(r) ? "#8a5a00" : "var(--muted, #667085)",
                    fontWeight: needsAttention(r) ? 600 : 400,
                  }}>
                    {visibilitySummary(r)}
                  </p>
                  <button
                    onClick={() => (isOpen ? setOpenId(null) : void openRecord(r))}
                    style={linkButton}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "Done" : "Change"}
                  </button>
                </div>

                {isOpen ? (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e6e8ec" }}>
                    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                      <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                        Who can see this
                      </legend>
                      {VISIBILITY_OPTIONS.map((o) => (
                        <label key={o.value} style={choice}>
                          <input
                            type="radio"
                            name={`vis-${r.recordId}`}
                            checked={r.visibility === o.value}
                            disabled={busy}
                            onChange={() => void choose(r, o.value)}
                            style={{ marginTop: 3 }}
                          />
                          <span>
                            <span style={{ fontWeight: 600 }}>{o.label}</span>
                            <span style={{ display: "block", fontSize: 13, color: "var(--muted, #667085)" }}>
                              {o.detail}
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>

                    {r.visibility === "specific" ? (
                      <div style={{ marginTop: 12 }}>
                        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>
                          Who to name
                        </p>
                        {guardians.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 13, color: "var(--muted, #667085)" }}>
                            No guardians are on this child&apos;s record yet.
                          </p>
                        ) : (
                          guardians.map((g) => (
                            <label key={g.userId} style={choice}>
                              <input
                                type="checkbox"
                                checked={granted.has(g.userId)}
                                disabled={busy}
                                onChange={(e) => void toggleGuardian(r, g, e.target.checked)}
                                style={{ marginTop: 3 }}
                              />
                              <span>
                                <span style={{ fontWeight: 600 }}>{g.name}</span>
                                {g.relationship ? (
                                  <span style={{ color: "var(--muted, #667085)" }}> · {g.relationship}</span>
                                ) : null}
                                {/* Naming somebody who cannot reach the surface
                                    at all looks like sharing and results in
                                    nothing. Said here rather than by removing
                                    them from the list: the choice is
                                    legitimate, and takes effect the moment the
                                    permission is granted. */}
                                {!g.canReachSurface ? (
                                  <span style={{ display: "block", fontSize: 13, color: "#8a5a00" }}>
                                    Naming them has no effect until their permissions include this
                                    kind of record.
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    ) : null}

                    {notice ? (
                      <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: "#b42318" }}>
                        {notice}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

const row: React.CSSProperties = {
  border: "1px solid #e6e8ec", borderRadius: 10, padding: "14px 16px", marginBottom: 10,
};
const choice: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", cursor: "pointer",
};
const linkButton: React.CSSProperties = {
  background: "none", border: 0, padding: 0, color: "#1f6feb", cursor: "pointer",
  font: "inherit", textDecoration: "underline",
};
const notice_style: React.CSSProperties = {
  border: "1px solid #e6e8ec", background: "#f7f8fa", borderRadius: 8,
  padding: "10px 12px", marginBottom: 14, fontSize: 14,
};
const emptyBox: React.CSSProperties = {
  border: "1px dashed #d0d5dd", borderRadius: 10, padding: 20,
};
