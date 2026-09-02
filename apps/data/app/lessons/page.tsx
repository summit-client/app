"use client";

import * as React from "react";
import {
  byCluster, getGoals, getPrograms, getResources, matches, sensitivityLabel,
  type LessonGoal, type LessonProgram, type LessonResource,
} from "@/lib/lessons";

/**
 * Lesson Plan Bank.
 *
 * The organization's group programming, grouped by cluster because that is how
 * the library itself is organized and how clinicians ask for it - "what have we
 * got for cooking" rather than "what starts with M".
 */
export default function LessonsPage() {
  const [programs, setPrograms] = React.useState<LessonProgram[]>([]);
  const [query, setQuery] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [resources, setResources] = React.useState<LessonResource[]>([]);
  const [goals, setGoals] = React.useState<LessonGoal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getPrograms()
      .then(setPrograms)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the lesson bank."))
      .finally(() => setLoading(false));
  }, []);

  async function open(p: LessonProgram) {
    if (openId === p.id) { setOpenId(null); return; }
    setOpenId(p.id); setResources([]); setGoals([]);
    const [r, g] = await Promise.allSettled([getResources(p.id), getGoals(p.id)]);
    if (r.status === "fulfilled") setResources(r.value);
    if (g.status === "fulfilled") setGoals(g.value);
  }

  const filtered = programs.filter((p) => matches(p, query));
  const clusters = byCluster(filtered);

  return (
    <div>
      <h1 className="h-page">Lesson Plan Bank</h1>
      <p className="sub" style={{ maxWidth: "72ch" }}>
        Group programming: what each group runs, the resources behind it, and the
        goals it works on. Individual client targets live in the Goal Bank.
      </p>

      <input
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="cooking, regulation, STEM…"
        aria-label="Search lesson plans"
        style={{ maxWidth: 420, margin: "14px 0" }}
      />

      {error ? <p className="pill bad">{error}</p> : null}
      {loading ? <p className="sub">Loading…</p> : null}

      {!loading && filtered.length === 0 ? (
        <div className="card card-pad">
          <p className="sub" style={{ margin: 0 }}>Nothing matches that.</p>
        </div>
      ) : null}

      {clusters.map(({ cluster, programs: ps }) => (
        <section key={cluster} style={{ marginBottom: 26 }}>
          <h2 style={{
            fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase",
            color: "var(--muted)", fontWeight: 700, margin: "0 0 10px",
          }}>
            {cluster}
          </h2>

          <div style={{ display: "grid", gap: 10 }}>
            {ps.map((p) => {
              const isOpen = openId === p.id;
              return (
                <div key={p.id} className="card">
                  <button
                    type="button" onClick={() => void open(p)} aria-expanded={isOpen}
                    className="card-pad"
                    style={{
                      width: "100%", textAlign: "left", background: "transparent",
                      border: 0, cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <b style={{ fontSize: "var(--text-sm)", flex: 1, minWidth: 0 }}>{p.name}</b>
                      <span className="sub" style={{ whiteSpace: "nowrap" }}>
                        {p.weeks ? `${p.weeks} weeks` : ""}
                        {p.dayTime ? ` · ${p.dayTime}` : ""}
                      </span>
                    </span>
                    {p.focus ? (
                      <span className="sub" style={{ display: "block", marginTop: 3 }}>{p.focus}</span>
                    ) : null}
                  </button>

                  {isOpen ? (
                    <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
                      {p.description ? (
                        <p style={{ margin: "0 0 12px", lineHeight: 1.65 }}>{p.description}</p>
                      ) : null}

                      <dl style={{
                        display: "grid", gridTemplateColumns: "auto 1fr",
                        gap: "4px 14px", margin: "0 0 14px",
                      }}>
                        {/* Only fields that exist. The source library uses "Not
                            specified in source material." as a placeholder and
                            the import stores those as null, so an empty row
                            here means genuinely unrecorded. */}
                        <Field label="Model" value={p.model} />
                        <Field label="Format" value={p.format} />
                        <Field label="Group size" value={p.groupSize} />
                        <Field label="Setting" value={p.setting} />
                        <Field label="Duration" value={p.duration} />
                        <Field label="Ages" value={p.ageRange} />
                      </dl>

                      {goals.length > 0 ? (
                        <>
                          <p className="sub" style={{ margin: "0 0 6px", fontWeight: 600 }}>
                            Group goals
                          </p>
                          <ul style={{ margin: "0 0 14px", paddingLeft: 18, display: "grid", gap: 6 }}>
                            {goals.map((g) => (
                              <li key={g.id} style={{ lineHeight: 1.55 }}>
                                {g.goal}
                                {g.measurement ? (
                                  <span className="sub"> · {g.measurement}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}

                      <p className="sub" style={{ margin: "0 0 6px", fontWeight: 600 }}>
                        Resources
                      </p>
                      {resources.length === 0 ? (
                        <p className="sub" style={{ margin: 0 }}>
                          {p.resourceCount > 0
                            // The count comes from the catalogue and includes
                            // resources this reader may not open. Saying so
                            // beats an empty list that looks like a bug.
                            ? `${p.resourceCount} on file, none you can open.`
                            : "None on file."}
                        </p>
                      ) : (
                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                          {resources.map((r) => (
                            <li key={r.id} style={{
                              border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px",
                            }}>
                              <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  {r.url ? (
                                    <a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a>
                                  ) : r.name}
                                </span>
                                {/* Words, not a colour. Someone about to share
                                    a file needs to be told, not hinted at. */}
                                {sensitivityLabel(r) ? (
                                  <span className="pill warn" style={{ whiteSpace: "nowrap" }}>
                                    {sensitivityLabel(r)}
                                  </span>
                                ) : null}
                              </span>
                              <span className="sub" style={{ display: "block", marginTop: 2 }}>
                                {r.kind}{r.note ? ` · ${r.note}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt className="sub" style={{ margin: 0, fontWeight: 600 }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </>
  );
}
