import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHubAdmin } from "@/lib/hub/auth";
import { getEmployeeDetail } from "@/lib/hub/admin";
import { certStatus, certStatusLabel } from "@/lib/hub/certificates";
import { SignoffButtons, PdVerifyButton, TimeOffDecision, IssueCertificateForm } from "@/components/hub/admin-controls";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Team member", path: "/hub/admin", noindex: true });

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "-";
}
const TASK_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  AWAITING_SIGNOFF: "Awaiting sign-off",
  NOT_APPLICABLE: "N/A",
};

export default async function AdminEmployeePage({ params }: { params: { id: string } }) {
  await requireHubAdmin();
  const d = await getEmployeeDetail(params.id);
  if (!d) notFound();

  const p = d.profile;
  const pendingTimeOff = d.timeOff.filter((r) => r.status === "REQUESTED");
  const weeks = Array.from(new Set(d.tasks.map((t) => t.week))).sort();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href="/hub/admin" className="text-sm text-forest hover:underline">
          ← Admin
        </Link>
      </div>

      {/* Header */}
      <header className="border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {p.firstName} {p.lastName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {p.employeeNumber}
              {p.jobTitle ? ` · ${p.jobTitle}` : ""}
              {p.location?.name ? ` · ${p.location.name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/hub/print/report/onboarding/${d.user.id}`}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
            >
              Onboarding report
            </Link>
            <Link
              href={`/hub/print/report/training/${d.user.id}`}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
            >
              Training transcript
            </Link>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Start date</dt>
            <dd>{fmt(p.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Onboarding</dt>
            <dd className="tabular-nums">{d.ob.percent}% ({d.ob.completed}/{d.ob.applicable})</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">PD hours</dt>
            <dd className="tabular-nums">{d.pdHours.toFixed(1)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">VSC</dt>
            <dd>{p.vscStatus.replace(/_/g, " ").toLowerCase()}</dd>
          </div>
        </dl>
      </header>

      {/* Onboarding tasks */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Onboarding</h2>
        {weeks.map((wk) => (
          <div key={wk} className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-forest">Week {wk}</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {d.tasks
                .filter((t) => t.week === wk)
                .map((t) => {
                  const pr = d.progByTask.get(t.id);
                  const status = pr?.status ?? "NOT_STARTED";
                  const awaiting = status === "AWAITING_SIGNOFF";
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {TASK_LABEL[status]}
                          {t.supervisorSignoffRequired ? " · needs sign-off" : ""}
                          {pr?.completedAt ? ` · ${fmt(pr.completedAt)}` : ""}
                        </p>
                      </div>
                      {awaiting ? <SignoffButtons progressId={`${d.user.id}:${t.id}`} /> : null}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </section>

      {/* Professional development */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Professional development</h2>
        {d.pd.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {d.pd.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.title}
                    {r.verified ? <span className="ml-2 text-xs font-medium text-forest">Verified</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[r.provider, r.source, fmt(r.date), `${Number(r.hours).toFixed(1)}h`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <PdVerifyButton id={r.id} verified={r.verified} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No records yet.</p>
        )}
      </section>

      {/* Certificates */}
      <section>
        <h2 className="mb-1 text-base font-semibold">Certificates</h2>
        {d.certificates.length ? (
          <ul className="mb-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {d.certificates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.certNumber} · Issued {fmt(c.issuedDate)} · {certStatusLabel[certStatus(c.expiryDate)]}
                  </p>
                </div>
                <Link href={`/hub/print/certificate/${c.id}`} className="text-sm font-medium text-forest hover:underline">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">No certificates issued.</p>
        )}
        <IssueCertificateForm employeeUserId={d.user.id} />
      </section>

      {/* Time off */}
      {pendingTimeOff.length ? (
        <section>
          <h2 className="mb-3 text-base font-semibold">Time-off requests</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {pendingTimeOff.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.type === "VACATION" ? "Vacation" : "Sick / mental-health"}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(r.startDate)} to {fmt(r.endDate)} · {Number(r.days)} day{Number(r.days) === 1 ? "" : "s"}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </p>
                </div>
                <TimeOffDecision id={r.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
