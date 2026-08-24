import Link from "next/link";
import { requireHubAdmin } from "@/lib/hub/auth";
import { getAdminOverview } from "@/lib/hub/admin";
import { SignoffButtons, TimeOffDecision } from "@/components/hub/admin-controls";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Admin", path: "/hub/admin", noindex: true });

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "-";
}
function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return fmt(d);
}
const AUDIT_LABEL: Record<string, string> = {
  "signoff.approved": "approved a sign-off",
  "signoff.returned": "returned a task",
  "time_off.requested": "requested time off",
  "time_off.approved": "approved time off",
  "time_off.denied": "declined time off",
  "pd.verified": "verified a PD record",
  "pd.unverified": "unverified a PD record",
  "certificate.issued": "issued a certificate",
  "training.completed": "completed training",
  "vsc.status_changed": "updated a VSC status",
};

const VSC_LABEL: Record<string, string> = {
  NOT_SUBMITTED: "Not submitted",
  APPLIED: "Applied",
  PENDING: "Pending",
  CLEARED: "Cleared",
  REQUIRES_FOLLOWUP: "Follow-up",
};

export default async function AdminPage() {
  await requireHubAdmin();
  const o = await getAdminOverview();
  const hasQueue = o.pendingSignoffs.length > 0 || o.pendingTimeOff.length > 0 || o.unverifiedPd > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-muted-foreground">Approvals, the team directory, and recent activity.</p>
      </header>

      {/* Needs attention */}
      {hasQueue ? (
        <section className="space-y-6">
          <h2 className="text-base font-semibold">Needs attention</h2>

          {o.pendingSignoffs.length ? (
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Task sign-offs ({o.pendingSignoffs.length})</h3>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {o.pendingSignoffs.map((s) => (
                  <li key={s.progressId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.taskTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/hub/admin/${s.employeeId}`} className="text-forest hover:underline">
                          {s.employeeName}
                        </Link>{" "}
                        · Week {s.week}
                      </p>
                    </div>
                    <SignoffButtons progressId={s.progressId} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {o.pendingTimeOff.length ? (
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Time-off requests ({o.pendingTimeOff.length})</h3>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {o.pendingTimeOff.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.type === "VACATION" ? "Vacation" : "Sick / mental-health"} · {fmt(r.startDate)} to {fmt(r.endDate)} · {r.days} day
                        {r.days === 1 ? "" : "s"}
                      </p>
                    </div>
                    <TimeOffDecision id={r.id} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {o.unverifiedPd > 0 ? (
            <p className="text-sm text-muted-foreground">
              {o.unverifiedPd} professional-development record{o.unverifiedPd === 1 ? "" : "s"} awaiting verification. Open a team member to review.
            </p>
          ) : null}
        </section>
      ) : (
        <section>
          <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
        </section>
      )}

      {/* Team directory */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Team ({o.employees.length})</h2>
        {o.employees.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Team directory</caption>
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Employee</th>
                  <th scope="col" className="px-3 py-2 font-medium">Role</th>
                  <th scope="col" className="px-3 py-2 font-medium">Location</th>
                  <th scope="col" className="px-3 py-2 font-medium">Onboarding</th>
                  <th scope="col" className="px-3 py-2 font-medium">Training due</th>
                  <th scope="col" className="px-3 py-2 font-medium">VSC</th>
                  <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {o.employees.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">{e.employeeNumber}</div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{e.jobTitle ?? "-"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{e.location ?? "-"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{e.onboardingPercent}%</td>
                    <td className="px-3 py-2.5 tabular-nums">{e.trainingDue || "-"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{VSC_LABEL[e.vscStatus] ?? e.vscStatus}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/hub/admin/${e.id}`} className="font-medium text-forest hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        )}
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
        {o.recentAudit.length ? (
          <ul className="divide-y divide-border">
            {o.recentAudit.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{a.who}</span> {AUDIT_LABEL[a.action] ?? a.action}
                  {a.subject && a.subject !== a.who ? <span className="text-muted-foreground"> · {a.subject}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        )}
      </section>
    </div>
  );
}
