import type {
  GetServerSideProps, InferGetServerSidePropsType, NextApiRequest, NextApiResponse,
} from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { FamilyAvatar } from "../components/family-switcher";
import { LoadErrorNotice } from "../components/load-error-notice";
import { createClient } from "../lib/supabase-server";
import { browserClient } from "../lib/supabase-browser";
import { ageOf, can, canForAny, displayName, familyFromRows, type Family } from "../lib/family";
import { homeUrlFor } from "@summit/portals";
import { AvailabilityGrid, type AvailabilityRow } from "@summit/availability";
import { getSetting } from "@summit/settings";
import styles from "../styles/design-b.module.css";

type Household = {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  preferred_language: string;
};

type Member = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  relationship: string;
  email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  is_emergency_contact: boolean;
  client_id: number | null;
};

type Preference = "only" | "if_required" | "never";

type CareTeamMember = {
  client_id: number;
  staff_id: number;
  staff_name: string;
  staff_role: string | null;
  sessions_delivered: number;
  last_seen_on: string | null;
  next_on: string | null;
};

type TimelineEntry = {
  entry_id: string;
  client_id: number;
  occurred_on: string;
  source: string;
  kind: string;
  title: string;
  detail: string | null;
};

type PageProps =
  | {
      mode: "family";
      userId: string;
      family: Family;
      household: Household | null;
      members: Member[];
      careTeam: CareTeamMember[];
      timeline: TimelineEntry[];
      preferences: Record<number, Preference>;
      loadError: boolean;
    }
  | { mode: "no-access" }
  | { mode: "error" };

const RELATIONSHIP_LABELS: Record<string, string> = {
  parent: "Parent",
  guardian: "Guardian",
  step_parent: "Step-parent",
  foster_carer: "Foster carer",
  grandparent: "Grandparent",
  sibling: "Sibling",
  other_relative: "Relative",
  caseworker: "Caseworker",
  emergency_contact: "Emergency contact",
  authorized_contact: "Authorized contact",
  self: "Receives services",
};

const OBSERVATION_KINDS: { value: string; label: string }[] = [
  { value: "home_win", label: "Something that went well" },
  { value: "concern", label: "Something I am worried about" },
  { value: "school_update", label: "News from school" },
  { value: "health_update", label: "Health update" },
  { value: "behaviour_observation", label: "Something I noticed" },
  { value: "general", label: "Other" },
];

/**
 * The family record: who is on it, who works with the children, and the
 * shared history between the clinic and the home.
 *
 * This is the page that makes the portal a household's rather than a patient's.
 * Everything on it is about the family as a unit — the address a letter goes
 * to, the people on the record, the timeline both sides write to — which is
 * why it does not carry the child switcher: switching would narrow a page
 * whose subject is the family.
 */
export default function FamilyPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const router = useRouter();
  const [about, setAbout] = useState<string>("");
  const [kind, setKind] = useState(OBSERVATION_KINDS[0]!.value);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Editable copies of the server-rendered household/contacts/preferences -
  // declared unconditionally (rules of hooks), synced from props once mode
  // is known. Availability is fetched on demand per child instead of up
  // front - most visits don't open it, and it's a second query per child.
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [preferences, setPreferences] = useState<Record<number, Preference>>({});
  const [availabilityByChild, setAvailabilityByChild] = useState<Record<number, AvailabilityRow[]>>({});
  const [expandedAvailability, setExpandedAvailability] = useState<number | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({ full_name: "", relationship: "emergency_contact", phone: "", phone_secondary: "", email: "" });

  useEffect(() => {
    if (props.mode !== "family") return;
    setHousehold(props.household);
    setMembers(props.members);
    setPreferences(props.preferences);
  }, [props]);

  if (props.mode === "error") return <LoadErrorNotice />;

  if (props.mode === "no-access") {
    return (
      <>
        <MobileNavChrome title="Your family" />
        <div className={styles.page}>
          <Sidebar />
          <main className={styles.main}>
            <header style={{ marginBottom: 20 }}>
              <p className={styles.eyebrow}>CLIENT PORTAL</p>
              <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>Your family</h1>
            </header>
            <div className={styles.emptyBox}>
              <p style={{ margin: "0 0 8px", color: "var(--ink)", fontWeight: 600 }}>
                Your account is not linked to a family record yet.
              </p>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                The clinic can finish setting this up.
              </p>
            </div>
          </main>
        </div>
      </>
    );
  }

  const { family, careTeam, timeline, loadError, userId } = props;
  const canWrite = canForAny(family, "message_clinic");
  const canManageHousehold = canForAny(family, "manage_household");
  const nameOf = (clientId: number) => {
    const c = family.children.find((x) => x.clientId === clientId);
    return c ? displayName(c) : "your family";
  };

  async function saveHousehold(fields: Partial<Household>) {
    if (!household) return;
    const { error: hhErr } = await browserClient().from("households").update(fields).eq("id", household.id);
    if (hhErr) { setProblem(hhErr.message); return; }
    setHousehold({ ...household, ...fields });
  }

  async function addContact() {
    if (!household || !contactDraft.full_name.trim()) return;
    const { data, error: insErr } = await browserClient()
      .from("household_members")
      .insert({
        clinic_id: family.children[0]?.clinicId,
        household_id: household.id,
        full_name: contactDraft.full_name,
        relationship: contactDraft.relationship || "emergency_contact",
        is_emergency_contact: true,
        phone: contactDraft.phone || null,
        phone_secondary: contactDraft.phone_secondary || null,
        email: contactDraft.email || null,
      })
      .select("id, full_name, preferred_name, relationship, email, phone, phone_secondary, is_emergency_contact, client_id")
      .single();
    if (insErr) { setProblem(insErr.message); return; }
    setMembers((prev) => [...prev, data as Member]);
    setContactDraft({ full_name: "", relationship: "emergency_contact", phone: "", phone_secondary: "", email: "" });
    setAddingContact(false);
  }

  async function updateContact(id: string, fields: Partial<Member>) {
    const { error: updErr } = await browserClient().from("household_members").update(fields).eq("id", id);
    if (updErr) { setProblem(updErr.message); return; }
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));
  }

  async function savePreference(clientId: number, preference: Preference) {
    const child = family.children.find((c) => c.clientId === clientId);
    if (!child?.clinicId) return;
    const { error: prefErr } = await browserClient().from("home_session_preferences").upsert(
      { client_id: clientId, clinic_id: child.clinicId, preference, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "client_id" },
    );
    if (prefErr) { setProblem(prefErr.message); return; }
    setPreferences((prev) => ({ ...prev, [clientId]: preference }));
  }

  async function loadAvailability(clientId: number) {
    const { data } = await browserClient().from("client_availability").select("day, start_time, end_time").eq("client_id", clientId);
    setAvailabilityByChild((prev) => ({ ...prev, [clientId]: (data as AvailabilityRow[]) ?? [] }));
    setExpandedAvailability(clientId);
  }

  async function saveAvailability(clientId: number, ranges: Array<{ client_id?: number; day: string; start_time: string; end_time: string }>) {
    const child = family.children.find((c) => c.clientId === clientId);
    if (!child?.clinicId) return;
    const scoped = ranges.map((r) => ({ day: r.day, start_time: r.start_time, end_time: r.end_time, client_id: clientId, clinic_id: child.clinicId }));
    const sb = browserClient();
    const { error: delErr } = await sb.from("client_availability").delete().eq("client_id", clientId);
    if (delErr) { setProblem(delErr.message); return; }
    if (scoped.length) {
      const { error: insErr } = await sb.from("client_availability").insert(scoped);
      if (insErr) { setProblem(insErr.message); return; }
    }
    setAvailabilityByChild((prev) => ({ ...prev, [clientId]: scoped }));
    setExpandedAvailability(null);
  }

  async function saveObservation(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setProblem("Write something before saving."); return; }
    if (!about) { setProblem("Choose who this is about."); return; }
    setBusy(true); setProblem(null);
    try {
      const res = await fetch("/api/family/observation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: Number(about), kind, body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setProblem(json.error || "That was not saved."); return; }
      setBody("");
      router.replace(router.asPath, undefined, { scroll: false });
    } catch {
      setProblem("That did not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Children who receive services are shown as people, not as rows in the
  // contacts list - they are the subject of the record, not a contact on it.
  const contacts = members.filter((m) => m.relationship !== "self");

  return (
    <>
      <MobileNavChrome title="Your family" />
      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header style={{ marginBottom: 24 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>
              {household?.name ?? "Your family"}
            </h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Who is on your record, who works with your children, and what you have shared.
            </p>
          </header>

          {loadError ? (
            <div className={styles.emptyBox} role="alert">
              Some of this page couldn&apos;t load. Try refreshing.
            </div>
          ) : null}

          {/* ---------------------------------------------------------- */}
          <h2 style={sectionHeading}>Children</h2>
          <ul style={{ listStyle: "none", margin: "0 0 32px", padding: 0, display: "grid", gap: 10 }}>
            {family.children.map((c) => {
              const age = ageOf(c);
              return (
                <li key={c.clientId} style={rowStyle}>
                  <FamilyAvatar label={displayName(c)} clientId={c.clientId} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", color: "var(--ink)", fontWeight: 600, fontSize: 15 }}>
                      {displayName(c)}
                    </span>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                      {age !== null ? `${age} years old` : "Date of birth not on file"}
                      {/* What this guardian may do for this child, said plainly.
                          Two adults on one record often hold different
                          permissions and have no other way to find out. */}
                      {can(c, "view_clinical_progress") ? " · you can see progress" : ""}
                      {can(c, "view_billing") ? " · you can see funding" : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {/* ---------------------------------------------------------- */}
          {household ? (
            <>
              <h2 style={sectionHeading}>Where we write to you</h2>
              {canManageHousehold ? (
                <HouseholdEditor household={household} onSave={saveHousehold} />
              ) : (
                <div style={{ ...rowStyle, display: "block", marginBottom: 32 }}>
                  <p style={{ margin: 0, color: "var(--ink)", lineHeight: 1.7 }}>
                    {[household.address_line1, household.address_line2,
                      [household.city, household.province].filter(Boolean).join(", "),
                      household.postal_code]
                      .filter(Boolean).join("\n") || "No address on file."}
                  </p>
                  <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14 }}>
                    {[household.phone, household.email].filter(Boolean).join(" · ") || "No phone or email on file."}
                  </p>
                  <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>
                    You don&apos;t have edit access to this yet — message the clinic to make changes.
                  </p>
                </div>
              )}
            </>
          ) : null}

          {/* ---------------------------------------------------------- */}
          <h2 style={sectionHeading}>People on your record</h2>
          {contacts.length === 0 ? (
            <div className={styles.emptyBox} style={{ marginBottom: canManageHousehold ? 12 : 32 }}>
              No other contacts on file.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: `0 0 ${canManageHousehold ? 12 : 32}px`, padding: 0, display: "grid", gap: 10 }}>
              {contacts.map((m) => (
                <li key={m.id} style={rowStyle}>
                  <FamilyAvatar label={m.preferred_name || m.full_name} clientId={null} size={34} />
                  {canManageHousehold ? (
                    <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
                      <input style={fieldStyle} value={m.full_name}
                        onChange={(e) => updateContact(m.id, { full_name: e.target.value })} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <input style={fieldStyle} placeholder="Phone" value={m.phone ?? ""}
                          onChange={(e) => updateContact(m.id, { phone: e.target.value })} />
                        <input style={fieldStyle} placeholder="Second phone" value={m.phone_secondary ?? ""}
                          onChange={(e) => updateContact(m.id, { phone_secondary: e.target.value })} />
                      </div>
                      <input style={fieldStyle} placeholder="Email" value={m.email ?? ""}
                        onChange={(e) => updateContact(m.id, { email: e.target.value })} />
                    </span>
                  ) : (
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", color: "var(--ink)", fontWeight: 600, fontSize: 15 }}>
                        {m.preferred_name || m.full_name}
                      </span>
                      <span style={{ display: "block", color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                        {RELATIONSHIP_LABELS[m.relationship] ?? "Contact"}
                        {m.is_emergency_contact ? " · emergency contact" : ""}
                        {m.phone ? ` · ${m.phone}` : ""}
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManageHousehold ? (
            addingContact ? (
              <div style={{ ...rowStyle, display: "grid", gap: 8, marginBottom: 32 }}>
                <input style={fieldStyle} placeholder="Name" value={contactDraft.full_name}
                  onChange={(e) => setContactDraft((d) => ({ ...d, full_name: e.target.value }))} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={fieldStyle} placeholder="Phone" value={contactDraft.phone}
                    onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))} />
                  <input style={fieldStyle} placeholder="Second phone" value={contactDraft.phone_secondary}
                    onChange={(e) => setContactDraft((d) => ({ ...d, phone_secondary: e.target.value }))} />
                </div>
                <input style={fieldStyle} placeholder="Email" value={contactDraft.email}
                  onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={primaryButton(false)} onClick={addContact}>Add contact</button>
                  <button type="button" style={{ ...primaryButton(false), background: "#fff", color: "#0C5350" }}
                    onClick={() => setAddingContact(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" style={{ ...primaryButton(false), background: "#fff", color: "#0C5350", marginBottom: 32 }}
                onClick={() => setAddingContact(true)}>
                + Add emergency contact
              </button>
            )
          ) : null}

          {/* ---------------------------------------------------------- */}
          <h2 style={sectionHeading}>Home session preference &amp; availability</h2>
          <ul style={{ listStyle: "none", margin: "0 0 32px", padding: 0, display: "grid", gap: 10 }}>
            {family.children.map((c) => (
              <li key={c.clientId} style={{ ...rowStyle, display: "block" }}>
                <span style={{ display: "block", color: "var(--ink)", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>
                  {displayName(c)}
                </span>
                <PreferenceRow value={preferences[c.clientId] ?? null} onChoose={(p) => savePreference(c.clientId, p)} />
                <div style={{ marginTop: 12 }}>
                  {expandedAvailability === c.clientId ? (
                    <AvailabilityGrid
                      entityId={c.clientId}
                      entityType="client"
                      existingAvailability={availabilityByChild[c.clientId] ?? []}
                      workStart={Math.floor(Number(String(getSetting("calendar.workStart") || "08:00").split(":")[0]))}
                      workEnd={Math.floor(Number(String(getSetting("calendar.workEnd") || "17:00").split(":")[0]))}
                      workDays={String(getSetting("calendar.workDays") || "Mon,Tue,Wed,Thu,Fri").split(",").map((d) => d.trim())}
                      incrementMinutes={Number(getSetting("calendar.gridIncrementMinutes")) || 30}
                      onSave={(ranges) => saveAvailability(c.clientId, ranges)}
                      onCancel={() => setExpandedAvailability(null)}
                    />
                  ) : (
                    <button type="button" style={{ ...primaryButton(false), background: "#fff", color: "#0C5350" }}
                      onClick={() => loadAvailability(c.clientId)}>
                      {(availabilityByChild[c.clientId] ?? []).length === 0 ? "Set availability" : "Edit availability"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* ---------------------------------------------------------- */}
          <h2 style={sectionHeading}>Who works with your children</h2>
          {careTeam.length === 0 ? (
            <div className={styles.emptyBox} style={{ marginBottom: 32 }}>
              {/* Honest about why this can be empty. The care team is derived
                  from sessions, so before the first one there is nobody to
                  name. */}
              This fills in once sessions have been scheduled.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: "0 0 32px", padding: 0, display: "grid", gap: 10 }}>
              {careTeam.map((t) => (
                <li key={`${t.client_id}:${t.staff_id}`} style={rowStyle}>
                  <FamilyAvatar label={t.staff_name} clientId={null} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", color: "var(--ink)", fontWeight: 600, fontSize: 15 }}>
                      {t.staff_name}
                    </span>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                      {t.staff_role ? `${t.staff_role} · ` : ""}
                      works with {nameOf(t.client_id)}
                      {t.sessions_delivered > 0
                        ? ` · ${t.sessions_delivered} session${t.sessions_delivered === 1 ? "" : "s"} so far`
                        : ""}
                      {t.next_on ? ` · next on ${t.next_on}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* ---------------------------------------------------------- */}
          <h2 style={sectionHeading}>Shared history</h2>

          {problem ? (
            <div role="alert" style={{
              border: "1px solid #E0B4A6", background: "#FDF4F1", borderRadius: 10,
              padding: "12px 14px", marginBottom: 16, color: "#8A3B22", fontSize: 14,
            }}>
              {problem}
            </div>
          ) : null}

          {canWrite ? (
            <form onSubmit={saveObservation} style={{ display: "grid", gap: 12, maxWidth: 600, marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select value={about} onChange={(e) => setAbout(e.target.value)}
                  aria-label="Who is this about?" style={{ ...fieldStyle, width: "auto", minWidth: 160 }}>
                  <option value="">Who is this about?</option>
                  {family.children
                    .filter((c) => can(c, "message_clinic"))
                    .map((c) => (
                      <option key={c.clientId} value={String(c.clientId)}>{displayName(c)}</option>
                    ))}
                </select>
                <select value={kind} onChange={(e) => setKind(e.target.value)}
                  aria-label="What kind of update?" style={{ ...fieldStyle, width: "auto", minWidth: 200 }}>
                  {OBSERVATION_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={body} onChange={(e) => setBody(e.target.value)} rows={3}
                aria-label="What happened?"
                placeholder="Something you noticed at home, at school, or anywhere else."
                style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.6 }}
              />
              {/* Said before they write, not after. A parent should know what
                  happens to this: it is kept beside the clinical record, not
                  in it, and nobody is paged. */}
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                This is saved to your family&apos;s history for the clinical team to read.
                It is not a message and nobody is alerted &mdash; if you need an answer,
                start a conversation in Messages.
              </p>
              <div>
                <button type="submit" disabled={busy} style={primaryButton(busy)}>
                  {busy ? "Saving…" : "Add to our history"}
                </button>
              </div>
            </form>
          ) : null}

          {timeline.length === 0 ? (
            <div className={styles.emptyBox}>
              Nothing here yet. Milestones your clinical team shares, and anything you
              add above, will appear together.
            </div>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
              {timeline.map((e) => {
                const fromFamily = e.source === "family_observation";
                return (
                  <li key={e.entry_id} style={{
                    border: "1px solid #dce8ee", borderRadius: 10, padding: "14px 16px",
                    // Where an entry came from is carried by position and a
                    // label, not by colour alone.
                    borderLeft: `3px solid ${fromFamily ? "#8A5A12" : "#0C5350"}`,
                    background: "#fff",
                  }}>
                    <p style={{
                      margin: "0 0 6px", fontSize: 12, letterSpacing: ".04em",
                      textTransform: "uppercase", fontWeight: 700, color: "var(--muted)",
                    }}>
                      {fromFamily ? "From you" : "From the clinic"} · {e.occurred_on} · {nameOf(e.client_id)}
                    </p>
                    <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--ink)", fontSize: 15 }}>
                      {e.title}
                    </p>
                    {e.detail ? (
                      <p style={{
                        margin: 0, color: "var(--ink)", lineHeight: 1.65,
                        whiteSpace: "pre-line", overflowWrap: "anywhere",
                      }}>
                        {e.detail}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </main>
      </div>
    </>
  );
}

const sectionHeading: React.CSSProperties = {
  fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase",
  color: "#607987", fontWeight: 700, margin: "0 0 12px",
};
const rowStyle: React.CSSProperties = {
  display: "flex", gap: 14, alignItems: "flex-start",
  border: "1px solid #dce8ee", borderRadius: 10, padding: "14px 16px", background: "#fff",
};
const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 10,
  border: "1px solid #cddde4", font: "inherit", color: "var(--ink)", background: "#fff",
};
function primaryButton(busy: boolean): React.CSSProperties {
  return {
    padding: "11px 20px", minHeight: 44, borderRadius: 999, border: "1px solid #0C5350",
    background: busy ? "#5a8a86" : "#0C5350", color: "#fff", fontWeight: 600,
    fontSize: 15, cursor: busy ? "progress" : "pointer",
  };
}

/**
 * Household address/phone/email, editable in place. Local draft state so
 * typing doesn't fire a write per keystroke - it saves on blur, and again
 * explicitly via the button for anyone who tabs straight to the next field.
 */
function HouseholdEditor({
  household, onSave,
}: {
  household: Household;
  onSave: (fields: Partial<Household>) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(household);

  useEffect(() => { setDraft(household); }, [household]);

  function field(key: keyof Household) {
    return {
      value: draft[key] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDraft((d) => ({ ...d, [key]: e.target.value })),
      onBlur: () => { if (draft[key] !== household[key]) onSave({ [key]: draft[key] || null }); },
    };
  }

  return (
    <div style={{ ...rowStyle, display: "grid", gap: 8, marginBottom: 32 }}>
      <input style={fieldStyle} placeholder="Address line 1" {...field("address_line1")} />
      <input style={fieldStyle} placeholder="Address line 2" {...field("address_line2")} />
      <div style={{ display: "flex", gap: 8 }}>
        <input style={fieldStyle} placeholder="City" {...field("city")} />
        <input style={fieldStyle} placeholder="Province" {...field("province")} />
        <input style={fieldStyle} placeholder="Postal code" {...field("postal_code")} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={fieldStyle} placeholder="Phone" {...field("phone")} />
        <input style={fieldStyle} placeholder="Email" {...field("email")} />
      </div>
    </div>
  );
}

const PREFERENCE_OPTIONS: { value: Preference; label: string }[] = [
  { value: "only", label: "Home sessions only" },
  { value: "if_required", label: "Home if required" },
  { value: "never", label: "Not at home" },
];

/** A choice of three, not a form field - one click commits it. */
function PreferenceRow({
  value, onChoose,
}: {
  value: Preference | null;
  onChoose: (p: Preference) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {PREFERENCE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChoose(opt.value)}
            style={{
              padding: "8px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: 600,
              border: `1px solid ${active ? "#0C5350" : "#cddde4"}`,
              background: active ? "#0C5350" : "#fff",
              color: active ? "#fff" : "var(--ink)",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res }) => {
  const supabase = createClient(req as NextApiRequest, res as NextApiResponse);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      redirect: {
        destination: process.env.NEXT_PUBLIC_LOGIN_URL || "https://summitclient.io/login",
        permanent: false,
      },
    };
  }

  const { data: familyRows, error: familyError } = await supabase
    .from("my_family")
    .select("client_id, client_name, client_status, preferred_name, date_of_birth, household_id, household_name, relationship, permissions, clinic_id");
  if (familyError) {
    console.error("family: load failed:", familyError.message);
    return { props: { mode: "error" } };
  }

  const family = familyFromRows(familyRows ?? []);
  if (family.children.length === 0) {
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role && profile.role !== "client") {
      return { redirect: { destination: homeUrlFor(profile.role), permanent: false } };
    }
    return { props: { mode: "no-access" } };
  }

  // Five independent reads. Run together rather than in sequence: none of them
  // needs another's result, and this page is five sections of one screen.
  const [households, membersRes, careRes, timelineRes, prefRes] = await Promise.all([
    supabase.from("households")
      .select("id, name, address_line1, address_line2, city, province, postal_code, phone, email, preferred_language")
      .limit(1),
    supabase.from("household_members")
      .select("id, full_name, preferred_name, relationship, email, phone, phone_secondary, is_emergency_contact, client_id")
      .eq("status", "ACTIVE")
      .order("relationship", { ascending: true }),
    supabase.rpc("my_care_team"),
    supabase.from("my_family_timeline")
      .select("entry_id, client_id, occurred_on, source, kind, title, detail")
      .order("occurred_on", { ascending: false })
      .limit(60),
    supabase.from("home_session_preferences")
      .select("client_id, preference")
      .in("client_id", family.children.map((c) => c.clientId)),
  ]);

  for (const [what, r] of [
    ["household", households], ["members", membersRes],
    ["care team", careRes], ["timeline", timelineRes], ["preferences", prefRes],
  ] as const) {
    if (r.error) console.error(`family: ${what} load failed:`, r.error.message);
  }

  const preferences: Record<number, Preference> = {};
  for (const row of (prefRes.data ?? []) as { client_id: number; preference: Preference }[]) {
    preferences[row.client_id] = row.preference;
  }

  return {
    props: {
      mode: "family",
      userId: user.id,
      family,
      household: (households.data?.[0] as Household) ?? null,
      members: (membersRes.data ?? []) as Member[],
      careTeam: (careRes.data ?? []) as CareTeamMember[],
      timeline: (timelineRes.data ?? []) as TimelineEntry[],
      preferences,
      loadError: Boolean(
        households.error || membersRes.error || careRes.error || timelineRes.error || prefRes.error),
    },
  };
};
