import type {
  GetServerSideProps, InferGetServerSidePropsType, NextApiRequest, NextApiResponse,
} from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import Sidebar from "../components/Sidebar";
import { MobileNavChrome } from "../components/mobile-nav-chrome";
import { LoadErrorNotice } from "../components/load-error-notice";
import { createClient } from "../lib/supabase-server";
import { clinicTodayDateStr } from "../lib/clinic-date";
import { can, childById, displayName, familyFromRows, type Family } from "../lib/family";
import {
  answerProblems, consentsFromRows, formStatus, formsFromRows, signatureProblem,
  sortForms, type ConsentItem, type FormField, type FormItem,
} from "../lib/forms";
import { homeUrlFor } from "@summit/portals";
import styles from "../styles/design-b.module.css";

type PageProps =
  | {
      mode: "forms";
      family: Family;
      forms: FormItem[];
      consents: ConsentItem[];
      today: string;
      loadError: boolean;
      /** The form being filled in, if the URL names one. */
      openId: string | null;
    }
  | { mode: "no-access" }
  | { mode: "error" };

/**
 * Forms and consents.
 *
 * One page rather than two, because the sidebar's long-standing split between
 * "Documents" and "Consents" describes how a clinic files things, not how a
 * family experiences them: both are "something the clinic needs from me", and
 * a parent hunting for the photography consent should not have to know which
 * of two pages it was filed under.
 *
 * Which form is open lives in the URL, so a half-filled form survives a
 * refresh as a link rather than as component state, and so a clinic can send
 * a family straight to the one they need.
 */
export default function Forms(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [signedName, setSignedName] = useState("");
  const [fieldProblems, setFieldProblems] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");

  if (props.mode === "error") return <LoadErrorNotice />;

  if (props.mode === "no-access") {
    return (
      <>
        <MobileNavChrome title="Forms" />
        <div className={styles.page}>
          <Sidebar />
          <main className={styles.main}>
            <header style={{ marginBottom: 20 }}>
              <p className={styles.eyebrow}>CLIENT PORTAL</p>
              <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>Forms and consents</h1>
            </header>
            <div className={styles.emptyBox}>
              <p style={{ margin: "0 0 8px", color: "var(--ink)", fontWeight: 600 }}>
                Forms are not turned on for your account.
              </p>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Another adult on your family record may handle these. The clinic can
                turn it on for you.
              </p>
            </div>
          </main>
        </div>
      </>
    );
  }

  const { family, forms, consents, today, loadError, openId } = props;
  const open = openId ? forms.find((f) => f.assignmentId === openId) ?? null : null;

  const ordered = useMemo(() => sortForms(forms, today), [forms, today]);
  const childName = (clientId: number) => {
    const c = childById(family, clientId);
    return c ? displayName(c) : "your family";
  };
  const mayComplete = (clientId: number) =>
    // A legacy single-child account has no my_family rows and therefore no
    // permission set; treating that as "no permission" would lock every
    // pre-household family out of their own forms.
    family.children.length === 0 || can(childById(family, clientId), "complete_forms");

  async function post(url: string, payload: unknown) {
    setBusy(true); setProblem(null); setFieldProblems({});
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem(json.error || "Something went wrong. Try again shortly.");
        if (json.problems) setFieldProblems(json.problems);
        return null;
      }
      return json;
    } catch {
      setProblem("That did not send. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    // Checked here first so the messages appear beside each field without a
    // round trip. The server checks again against the template as it is now,
    // which is the one that decides.
    const local = answerProblems(open.fields, answers);
    const nameIssue = signatureProblem(signedName);
    if (Object.keys(local).length > 0 || nameIssue) {
      setFieldProblems(local);
      setProblem(nameIssue ?? "Some answers still need attention.");
      return;
    }
    const json = await post("/api/forms/submit", {
      assignmentId: open.assignmentId, answers, signedName,
    });
    if (json) { setAnswers({}); setSignedName(""); router.push("/forms"); }
  }

  async function withdraw(consentId: string) {
    const json = await post("/api/forms/withdraw-consent", {
      consentId, reason: withdrawReason,
    });
    if (json) {
      setWithdrawing(null); setWithdrawReason("");
      router.replace(router.asPath, undefined, { scroll: false });
    }
  }

  return (
    <>
      <MobileNavChrome title="Forms" />
      <div className={styles.page}>
        <Sidebar />

        <main className={styles.main}>
          <header style={{ marginBottom: 22 }}>
            <p className={styles.eyebrow}>CLIENT PORTAL</p>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", gap: 16, flexWrap: "wrap",
            }}>
              <h1 style={{ margin: "0 0 6px", color: "var(--ink)" }}>
                {open ? open.title : "Forms and consents"}
              </h1>
              {open ? (
                <Link className={styles.textButton} href="/forms">Back to all forms</Link>
              ) : null}
            </div>
            {open ? (
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                For {childName(open.clientId)}
                {open.description ? ` · ${open.description}` : ""}
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--muted)" }}>
                What the clinic needs from you, and what you have agreed to.
              </p>
            )}
          </header>

          {loadError ? (
            <div className={styles.emptyBox} role="alert">
              Couldn&apos;t load your forms. Try refreshing the page.
            </div>
          ) : null}

          {problem ? (
            <div role="alert" style={{
              border: "1px solid #E0B4A6", background: "#FDF4F1", borderRadius: 10,
              padding: "12px 14px", marginBottom: 16, color: "#8A3B22", fontSize: 14,
            }}>
              {problem}
            </div>
          ) : null}

          {/* ---------------------------------------------------------- */}
          {/* Filling one in                                              */}
          {/* ---------------------------------------------------------- */}
          {open ? (
            open.completedAt ? (
              <div className={styles.emptyBox}>
                <p style={{ margin: "0 0 6px", color: "var(--ink)", fontWeight: 600 }}>
                  You sent this on {new Date(open.completedAt).toLocaleDateString()}.
                </p>
                {open.signedName ? (
                  <p style={{ margin: 0, color: "var(--muted)" }}>Signed as {open.signedName}.</p>
                ) : null}
              </div>
            ) : !mayComplete(open.clientId) ? (
              <div className={styles.emptyBox}>
                <p style={{ margin: "0 0 6px", color: "var(--ink)", fontWeight: 600 }}>
                  You can read this form, but not complete it.
                </p>
                <p style={{ margin: 0, color: "var(--muted)" }}>
                  Another adult on {childName(open.clientId)}&apos;s record handles forms.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} style={{ display: "grid", gap: 20, maxWidth: 620 }}>
                {open.consentStatement ? (
                  <p style={{
                    margin: 0, color: "var(--ink)", lineHeight: 1.7, fontSize: 15,
                    borderLeft: "3px solid #0C5350", paddingLeft: 14,
                  }}>
                    {open.consentStatement}
                  </p>
                ) : null}

                {open.fields.map((f) => (
                  <Field
                    key={f.id}
                    field={f}
                    value={answers[f.id]}
                    problem={fieldProblems[f.id]}
                    onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))}
                  />
                ))}

                <div style={{ display: "grid", gap: 6 }}>
                  <label htmlFor="signature" style={labelStyle}>
                    Type your name to sign
                  </label>
                  <input
                    id="signature" value={signedName}
                    onChange={(e) => setSignedName(e.target.value)}
                    style={fieldStyle}
                    autoComplete="name"
                  />
                  {/* Said plainly. A typed name is evidence of intent, and
                      claiming more for it than that would be the kind of thing
                      a family only discovers matters when it matters. */}
                  <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                    Your name, the date, and who was signed in are recorded with your answers.
                  </p>
                </div>

                <div>
                  <button type="submit" disabled={busy} style={primaryButton(busy)}>
                    {busy ? "Sending…" : open.kind === "consent" ? "Give consent" : "Send form"}
                  </button>
                </div>
              </form>
            )
          ) : null}

          {/* ---------------------------------------------------------- */}
          {/* The list                                                    */}
          {/* ---------------------------------------------------------- */}
          {!open ? (
            <>
              <h2 style={sectionHeading}>Forms</h2>
              {ordered.length === 0 ? (
                <div className={styles.emptyBox}>
                  Nothing to fill in right now. Forms the clinic needs will appear here.
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: "0 0 32px", padding: 0, display: "grid", gap: 2 }}>
                  {ordered.map((f) => {
                    const status = formStatus(f, today);
                    const overdue = status === "Overdue";
                    return (
                      <li key={f.assignmentId}>
                        <Link
                          href={`/forms?form=${f.assignmentId}`}
                          style={{
                            display: "flex", gap: 14, alignItems: "baseline",
                            padding: "15px 14px", textDecoration: "none",
                            borderBottom: "1px solid #e6eef2", flexWrap: "wrap",
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                              display: "block", color: "var(--ink)", fontSize: 15,
                              fontWeight: f.completedAt ? 500 : 700,
                            }}>
                              {f.title}
                            </span>
                            <span style={{ display: "block", color: "var(--muted)", fontSize: 13, marginTop: 3 }}>
                              {childName(f.clientId)}
                              {f.kind === "consent" ? " · Consent" : ""}
                            </span>
                          </span>
                          {/* Status as a word, with weight rather than colour
                              carrying the emphasis. */}
                          <span style={{
                            fontSize: 13, whiteSpace: "nowrap",
                            color: overdue ? "#8A3B22" : "var(--muted)",
                            fontWeight: overdue ? 700 : 500,
                          }}>
                            {status}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              <h2 style={sectionHeading}>What you have agreed to</h2>
              {consents.length === 0 ? (
                <div className={styles.emptyBox}>
                  No consents on file yet.
                </div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
                  {consents.map((c) => (
                    <li key={c.consentId} style={{
                      border: "1px solid #dce8ee", borderRadius: 10, padding: "14px 16px",
                      background: c.isActive ? "#fff" : "#FAFBFB",
                    }}>
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        gap: 12, flexWrap: "wrap", alignItems: "baseline",
                      }}>
                        <strong style={{ color: "var(--ink)", fontSize: 15 }}>{c.title}</strong>
                        <span style={{ fontSize: 13, color: c.isActive ? "#1B7A62" : "var(--muted)", fontWeight: 600 }}>
                          {c.isActive ? "Active" : "Withdrawn"}
                        </span>
                      </div>

                      {c.consentStatement ? (
                        <p style={{ margin: "8px 0 0", color: "var(--ink)", fontSize: 14, lineHeight: 1.6 }}>
                          {c.consentStatement}
                        </p>
                      ) : null}

                      {/* Both dates, always. The window is the point of the
                          record: "withdrawn" without "granted on" cannot answer
                          what the clinic was entitled to do in between. */}
                      <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
                        Given {new Date(c.grantedAt).toLocaleDateString()}
                        {c.signedName ? ` by ${c.signedName}` : ""}
                        {c.withdrawnAt
                          ? ` · withdrawn ${new Date(c.withdrawnAt).toLocaleDateString()}`
                          : ""}
                        {c.withdrawalReason ? ` · ${c.withdrawalReason}` : ""}
                      </p>

                      {c.isActive && mayComplete(c.clientId) ? (
                        withdrawing === c.consentId ? (
                          <div style={{ marginTop: 12, display: "grid", gap: 8, maxWidth: 460 }}>
                            <label htmlFor={`why-${c.consentId}`} style={{ fontSize: 13, color: "var(--muted)" }}>
                              If you would like to say why (optional)
                            </label>
                            <input
                              id={`why-${c.consentId}`}
                              value={withdrawReason}
                              onChange={(e) => setWithdrawReason(e.target.value)}
                              style={fieldStyle}
                            />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button type="button" disabled={busy}
                                onClick={() => withdraw(c.consentId)} style={primaryButton(busy)}>
                                {busy ? "Recording…" : "Withdraw consent"}
                              </button>
                              <button type="button" onClick={() => setWithdrawing(null)}
                                style={secondaryButton}>
                                Keep it
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setWithdrawing(c.consentId)}
                            style={{ ...secondaryButton, marginTop: 12 }}>
                            Withdraw
                          </button>
                        )
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </main>
      </div>
    </>
  );
}

/** One question. Its own component so each field type stays legible. */
function Field({
  field, value, problem, onChange,
}: {
  field: FormField;
  value: unknown;
  problem: string | undefined;
  onChange: (v: unknown) => void;
}) {
  const id = `f-${field.id}`;
  const describedBy = problem ? `${id}-problem` : field.help ? `${id}-help` : undefined;
  const common = {
    id,
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": describedBy,
    style: { ...fieldStyle, borderColor: problem ? "#C1705A" : "#cddde4" },
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label htmlFor={id} style={labelStyle}>
        {field.label}
        {/* The word, not an asterisk. An asterisk needs a legend somewhere
            else on the page to mean anything. */}
        {field.required ? (
          <span style={{ color: "var(--muted)", fontWeight: 500 }}> (needed)</span>
        ) : null}
      </label>

      {field.help ? (
        <p id={`${id}-help`} style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          {field.help}
        </p>
      ) : null}

      {field.type === "longtext" ? (
        <textarea {...common} rows={4} value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "choice" ? (
        <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose one</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "checkbox" ? (
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 15, color: "var(--ink)" }}>
          <input
            id={id} type="checkbox" checked={value === true}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.checked)}
            style={{ width: 20, height: 20 }}
          />
          Yes
        </label>
      ) : (
        <input
          {...common}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {problem ? (
        <p id={`${id}-problem`} role="alert" style={{ margin: 0, fontSize: 13, color: "#8A3B22" }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontWeight: 600, color: "var(--ink)", fontSize: 14 };
const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 10,
  border: "1px solid #cddde4", font: "inherit", color: "var(--ink)", background: "#fff",
};
const sectionHeading: React.CSSProperties = {
  fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase",
  color: "#607987", fontWeight: 700, margin: "0 0 12px",
};
function primaryButton(busy: boolean): React.CSSProperties {
  return {
    padding: "11px 20px", minHeight: 44, borderRadius: 999, border: "1px solid #0C5350",
    background: busy ? "#5a8a86" : "#0C5350", color: "#fff", fontWeight: 600,
    fontSize: 15, cursor: busy ? "progress" : "pointer",
  };
}
const secondaryButton: React.CSSProperties = {
  padding: "10px 18px", minHeight: 44, borderRadius: 999,
  border: "1px solid #cddde4", background: "#fff", color: "#365468",
  fontWeight: 600, fontSize: 14, cursor: "pointer",
};

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, query }) => {
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
    console.error("forms: family load failed:", familyError.message);
    return { props: { mode: "error" } };
  }
  const family = familyFromRows(familyRows ?? []);

  if (family.children.length === 0) {
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role && profile.role !== "client") {
      return { redirect: { destination: homeUrlFor(profile.role), permanent: false } };
    }
    // A legacy single-child account still reaches its own forms through RLS,
    // so it gets the page rather than the no-access notice.
  } else if (!family.children.some((c) => c.permissions.includes("view_forms"))) {
    return { props: { mode: "no-access" } };
  }

  const [{ data: formRows, error: formsError }, { data: consentRows, error: consentsError }] =
    await Promise.all([
      supabase.from("my_forms").select("*"),
      supabase.from("my_consents").select("*").order("granted_at", { ascending: false }),
    ]);

  if (formsError) console.error("forms: load failed:", formsError.message);
  if (consentsError) console.error("forms: consents load failed:", consentsError.message);

  return {
    props: {
      mode: "forms",
      family,
      forms: formsFromRows(formRows ?? []),
      consents: consentsFromRows(consentRows ?? []),
      // The clinic's today, not the browser's - see lib/clinic-date.ts for why
      // an overdue badge computed from a device clock is wrong for anyone
      // travelling.
      today: clinicTodayDateStr(),
      loadError: Boolean(formsError || consentsError),
      openId: typeof query.form === "string" ? query.form : null,
    },
  };
};
