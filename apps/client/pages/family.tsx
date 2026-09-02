import type {
  GetServerSideProps, InferGetServerSidePropsType, NextApiRequest, NextApiResponse,
} from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { FamilyAvatar } from "../components/family-switcher";
import { LoadErrorNotice } from "../components/load-error-notice";
import { createClient } from "../lib/supabase-server";
import { ageOf, can, canForAny, displayName, familyFromRows, type Family } from "../lib/family";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type Household = {
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  phone: string | null;
  preferred_language: string;
};

type Member = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  relationship: string;
  email: string | null;
  phone: string | null;
  is_emergency_contact: boolean;
  client_id: number | null;
};

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
      family: Family;
      household: Household | null;
      members: Member[];
      careTeam: CareTeamMember[];
      timeline: TimelineEntry[];
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

  const { family, household, members, careTeam, timeline, loadError } = props;
  const canWrite = canForAny(family, "message_clinic");
  const nameOf = (clientId: number) => {
    const c = family.children.find((x) => x.clientId === clientId);
    return c ? displayName(c) : "your family";
  };

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
              <div style={{ ...rowStyle, display: "block", marginBottom: 32 }}>
                <p style={{ margin: 0, color: "var(--ink)", lineHeight: 1.7 }}>
                  {[household.address_line1, household.address_line2,
                    [household.city, household.province].filter(Boolean).join(", "),
                    household.postal_code]
                    .filter(Boolean).join("\n") || "No address on file."}
                </p>
                {household.phone ? (
                  <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14 }}>
                    {household.phone}
                  </p>
                ) : null}
                {/* Read-only, and it says so rather than offering an Edit
                    button that would not work. Changing a household address is
                    gated on manage_household and there is no write path yet. */}
                <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>
                  To change any of this, message the clinic and they will update it.
                </p>
              </div>
            </>
          ) : null}

          {/* ---------------------------------------------------------- */}
          <h2 style={sectionHeading}>People on your record</h2>
          {contacts.length === 0 ? (
            <div className={styles.emptyBox} style={{ marginBottom: 32 }}>
              No other contacts on file.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: "0 0 32px", padding: 0, display: "grid", gap: 10 }}>
              {contacts.map((m) => (
                <li key={m.id} style={rowStyle}>
                  <FamilyAvatar label={m.preferred_name || m.full_name} clientId={null} size={34} />
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
                </li>
              ))}
            </ul>
          )}

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
    .select("client_id, client_name, client_status, preferred_name, date_of_birth, household_id, household_name, relationship, permissions");
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

  // Four independent reads. Run together rather than in sequence: none of them
  // needs another's result, and this page is four sections of one screen.
  const [households, membersRes, careRes, timelineRes] = await Promise.all([
    supabase.from("households")
      .select("name, address_line1, address_line2, city, province, postal_code, phone, preferred_language")
      .limit(1),
    supabase.from("household_members")
      .select("id, full_name, preferred_name, relationship, email, phone, is_emergency_contact, client_id")
      .eq("status", "ACTIVE")
      .order("relationship", { ascending: true }),
    supabase.rpc("my_care_team"),
    supabase.from("my_family_timeline")
      .select("entry_id, client_id, occurred_on, source, kind, title, detail")
      .order("occurred_on", { ascending: false })
      .limit(60),
  ]);

  for (const [what, r] of [
    ["household", households], ["members", membersRes],
    ["care team", careRes], ["timeline", timelineRes],
  ] as const) {
    if (r.error) console.error(`family: ${what} load failed:`, r.error.message);
  }

  return {
    props: {
      mode: "family",
      family,
      household: (households.data?.[0] as Household) ?? null,
      members: (membersRes.data ?? []) as Member[],
      careTeam: (careRes.data ?? []) as CareTeamMember[],
      timeline: (timelineRes.data ?? []) as TimelineEntry[],
      loadError: Boolean(
        households.error || membersRes.error || careRes.error || timelineRes.error),
    },
  };
};
