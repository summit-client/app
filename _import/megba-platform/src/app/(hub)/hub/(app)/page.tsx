import Link from "next/link";
import { requireHubUserWithProfile } from "@/lib/hub/auth";
import { getHubDashboard } from "@/lib/hub/dashboard";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Home", path: "/hub", noindex: true });

function dayGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "-";
}

export default async function HubHomePage() {
  const user = await requireHubUserWithProfile();
  const p = user.profile!;
  const d = await getHubDashboard(user.id, p.startDate ?? null);
  const to = d.timeOff;
  const today = new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });

  const summary = [
    { label: "Onboarding", value: `${d.onboarding.percent}%`, href: "/hub/onboarding" },
    { label: "Training due", value: String(d.trainingDue.length), href: "/hub/training" },
    { label: "PD hours", value: d.pdHours.toFixed(1), href: "/hub/pd" },
    { label: "Certificates", value: String(d.certificatesCount), href: "/hub/certificates" },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      {/* Page header */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold">
          {dayGreeting()}, {p.firstName}
        </h1>
        <span className="text-sm text-muted-foreground">{today}</span>
      </div>

      {/* At a glance, compact, each figure links into its workflow */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {summary.map((s) => (
          <Link key={s.label} href={s.href} className="group block">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</dt>
            <dd className="text-xl font-semibold group-hover:text-forest">{s.value}</dd>
          </Link>
        ))}
      </dl>

      {/* Onboarding */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Onboarding</h2>
          <Link href="/hub/onboarding" className="text-sm font-medium text-forest hover:underline">
            Continue
          </Link>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-forest" style={{ width: `${d.onboarding.percent}%` }} />
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {d.onboarding.completed} of {d.onboarding.requiredApplicable} required tasks complete
          {d.nextTaskTitle ? (
            <>
              {" · next: "}
              <span className="text-foreground">{d.nextTaskTitle}</span>
            </>
          ) : null}
        </p>
      </section>

      {/* Training due */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Training due</h2>
          <Link href="/hub/training" className="text-sm font-medium text-forest hover:underline">
            All training
          </Link>
        </div>
        {d.trainingDue.length ? (
          <ul className="mt-2 divide-y divide-border">
            {d.trainingDue.slice(0, 5).map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-sm">{t.title}</span>
                <span className="shrink-0 text-sm text-muted-foreground">Due {fmt(t.dueDate)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Nothing due right now.</p>
        )}
      </section>

      {/* Time off */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Time off</h2>
          <Link href="/hub/time-off" className="text-sm font-medium text-forest hover:underline">
            Request
          </Link>
        </div>
        {to ? (
          <>
            <div className="mt-2 grid gap-x-8 text-sm sm:grid-cols-2">
              <div className="flex justify-between border-b border-border py-1.5">
                <span className="text-muted-foreground">Vacation</span>
                <span>
                  <span className="font-medium">{to.vacation.remaining}</span> of {to.vacation.entitled} days left
                </span>
              </div>
              <div className="flex justify-between border-b border-border py-1.5">
                <span className="text-muted-foreground">Sick / mental-health</span>
                <span>
                  <span className="font-medium">{to.sick.remaining}</span> of {to.sick.entitled} days left
                </span>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {to.serviceYears} year{to.serviceYears === 1 ? "" : "s"} of service · resets {fmt(to.nextReset)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Add your start date in{" "}
            <Link href="/hub/profile" className="text-forest hover:underline">
              your profile
            </Link>{" "}
            to see your vacation and sick balances.
          </p>
        )}
      </section>
    </div>
  );
}
