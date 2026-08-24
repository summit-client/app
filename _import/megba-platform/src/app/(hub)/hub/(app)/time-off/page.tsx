import Link from "next/link";
import { requireHubUserWithProfile } from "@/lib/hub/auth";
import { prisma } from "@/lib/prisma";
import { computeEntitlements, type RequestLite } from "@/lib/hub/entitlements";
import { TimeOffForm } from "@/components/hub/time-off-form";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Time Off", path: "/hub/time-off", noindex: true });

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "-";
}

const STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: "Pending", cls: "text-ember-600" },
  APPROVED: { label: "Approved", cls: "text-forest" },
  DENIED: { label: "Denied", cls: "text-maple" },
  CANCELLED: { label: "Cancelled", cls: "text-muted-foreground" },
};

export default async function TimeOffPage() {
  const user = await requireHubUserWithProfile();
  const p = user.profile!;
  const hireDate = p.startDate ?? null;

  const requests = await prisma.hubTimeOffRequest.findMany({
    where: { employeeUserId: user.id },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });

  const ent = hireDate
    ? computeEntitlements(
        hireDate,
        requests.map<RequestLite>((r) => ({
          type: r.type as RequestLite["type"],
          days: Number(r.days),
          status: r.status as RequestLite["status"],
          startDate: r.startDate,
        })),
      )
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Time Off</h1>
        <p className="mt-1 text-muted-foreground">
          Vacation and sick / mental-health days. Balances reset on your hire-date anniversary.
        </p>
      </header>

      {!hireDate ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Add your start date in{" "}
            <Link href="/hub/profile" className="text-forest hover:underline">your profile</Link> to
            see your balances and request time off.
          </p>
        </div>
      ) : (
        <>
          {/* Balances */}
          <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            <div className="bg-card p-4">
              <p className="text-sm font-medium text-muted-foreground">Vacation</p>
              <p className="mt-1 text-2xl font-semibold">
                {ent!.vacation.remaining}
                <span className="text-sm font-normal text-muted-foreground"> of {ent!.vacation.entitled} days</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ent!.vacation.used} used{ent!.vacation.pending ? ` · ${ent!.vacation.pending} pending` : ""}
              </p>
            </div>
            <div className="bg-card p-4">
              <p className="text-sm font-medium text-muted-foreground">Sick / mental-health</p>
              <p className="mt-1 text-2xl font-semibold">
                {ent!.sick.remaining}
                <span className="text-sm font-normal text-muted-foreground"> of {ent!.sick.entitled} days</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ent!.sick.used} used{ent!.sick.pending ? ` · ${ent!.sick.pending} pending` : ""}
              </p>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Hire date {fmt(hireDate)} · {ent!.serviceYears} year{ent!.serviceYears === 1 ? "" : "s"} of service · resets{" "}
            {fmt(ent!.nextReset)}
          </p>

          {/* Request form */}
          <section className="border-t border-border pt-6">
            <h2 className="mb-3 text-base font-semibold">Request time off</h2>
            <TimeOffForm />
            <p className="mt-3 text-xs text-muted-foreground">
              Submitting notifies the office by email. Vacation entitlement follows Ontario ESA
              minimums (2 weeks, rising to 3 weeks at 5 years of service).
            </p>
          </section>

          {/* History */}
          <section className="border-t border-border pt-6">
            <h2 className="mb-3 text-base font-semibold">Your requests</h2>
            {requests.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Your time-off requests</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-medium">Type</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Dates</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Days</th>
                      <th scope="col" className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => {
                      const st = STATUS[r.status] ?? STATUS.REQUESTED;
                      return (
                        <tr key={r.id} className="border-b border-border last:border-0">
                          <td className="whitespace-nowrap py-2.5 pr-4">
                            {r.type === "VACATION" ? "Vacation" : "Sick / MH"}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">
                            {fmt(r.startDate)} – {fmt(r.endDate)}
                          </td>
                          <td className="py-2.5 pr-4">{Number(r.days)}</td>
                          <td className="py-2.5">
                            <span className={`text-xs font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
