import Link from "next/link";
import { notFound } from "next/navigation";
import { getHubSessionUser } from "@/lib/hub/session";
import { getEmployeeDetail } from "@/lib/hub/admin";
import { certStatus, certStatusLabel } from "@/lib/hub/certificates";
import { PrintButton } from "@/components/hub/print-button";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Onboarding report", path: "/hub/print/report", noindex: true });

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "-";
}
const TASK_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  AWAITING_SIGNOFF: "Awaiting sign-off",
  NOT_APPLICABLE: "N/A",
};

export default async function OnboardingReportPage({ params }: { params: { id: string } }) {
  const user = await getHubSessionUser();
  const isAdmin = user?.role === "ADMIN";
  if (!user) notFound();
  if (params.id !== user.id && !isAdmin) notFound();

  const d = await getEmployeeDetail(params.id);
  if (!d) notFound();
  const p = d.profile;
  const weeks = Array.from(new Set(d.tasks.map((t) => t.week))).sort();
  const trainingDone = d.training.filter((t) => t.status === "COMPLETED").length;

  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 16mm; } .no-print { display: none !important; } body { background: #fff; } }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <Link href={isAdmin ? `/hub/admin/${p.userId}` : "/hub"} className="text-sm text-forest hover:underline">
          ← Back
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10 text-sm">
        {/* Masthead */}
        <div className="flex items-start justify-between border-b-2 border-forest pb-4">
          <div>
            <p className="font-display text-lg font-bold text-forest">Mount Etna Global Behaviour Academy</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Onboarding Report</p>
          </div>
          <p className="text-xs text-muted-foreground">Generated {fmt(new Date())}</p>
        </div>

        {/* Employee summary */}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div className="col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Employee</dt>
            <dd className="font-medium">
              {p.firstName} {p.lastName} <span className="text-muted-foreground">· {p.employeeNumber}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Role</dt>
            <dd>{p.jobTitle ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Location</dt>
            <dd>{p.location?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Start date</dt>
            <dd>{fmt(p.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Onboarding</dt>
            <dd className="tabular-nums">{d.ob.percent}% ({d.ob.completed}/{d.ob.applicable})</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Training complete</dt>
            <dd className="tabular-nums">{trainingDone}/{d.courses.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">PD hours</dt>
            <dd className="tabular-nums">{d.pdHours.toFixed(1)}</dd>
          </div>
        </dl>

        {/* Tasks */}
        {weeks.map((wk) => (
          <section key={wk} className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-forest">Week {wk}</h2>
            <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Week {wk} onboarding tasks</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Task</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Completed</th>
                  <th scope="col" className="py-1.5 font-medium">Signed off</th>
                </tr>
              </thead>
              <tbody>
                {d.tasks
                  .filter((t) => t.week === wk)
                  .map((t) => {
                    const pr = d.progByTask.get(t.id);
                    return (
                      <tr key={t.id} className="border-b border-border/60 align-top">
                        <td className="py-1.5 pr-3">{t.title}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{TASK_LABEL[pr?.status ?? "NOT_STARTED"]}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{fmt(pr?.completedAt ?? null)}</td>
                        <td className="py-1.5 text-muted-foreground">{pr?.supervisorSignedAt ? fmt(pr.supervisorSignedAt) : "-"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            </div>
          </section>
        ))}

        {/* Certificates */}
        {d.certificates.length ? (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-forest">Certificates</h2>
            <ul className="space-y-1">
              {d.certificates.map((c) => (
                <li key={c.id} className="flex justify-between border-b border-border/60 py-1">
                  <span>{c.title} <span className="text-muted-foreground">· {c.certNumber}</span></span>
                  <span className="text-muted-foreground">{fmt(c.issuedDate)} · {certStatusLabel[certStatus(c.expiryDate)]}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-8 border-t border-border pt-3 text-xs text-muted-foreground">
          Generated by the Mount Etna Employee Hub. This report reflects records at the time of generation.
        </p>
      </div>
    </>
  );
}
