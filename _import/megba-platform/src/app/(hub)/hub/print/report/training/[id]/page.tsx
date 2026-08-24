import Link from "next/link";
import { notFound } from "next/navigation";
import { getHubSessionUser } from "@/lib/hub/session";
import { getEmployeeDetail } from "@/lib/hub/admin";
import { PrintButton } from "@/components/hub/print-button";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Training transcript", path: "/hub/print/report", noindex: true });

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "-";
}

export default async function TrainingReportPage({ params }: { params: { id: string } }) {
  const user = await getHubSessionUser();
  const isAdmin = user?.role === "ADMIN";
  if (!user) notFound();
  if (params.id !== user.id && !isAdmin) notFound();

  const d = await getEmployeeDetail(params.id);
  if (!d) notFound();
  const p = d.profile;
  const courseById = new Map(d.courses.map((c) => [c.id, c]));

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
        <div className="flex items-start justify-between border-b-2 border-forest pb-4">
          <div>
            <p className="font-display text-lg font-bold text-forest">Mount Etna Global Behaviour Academy</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Training &amp; Professional-Development Transcript</p>
          </div>
          <p className="text-xs text-muted-foreground">Generated {fmt(new Date())}</p>
        </div>

        <p className="mt-4 font-medium">
          {p.firstName} {p.lastName} <span className="text-muted-foreground">· {p.employeeNumber}</span>
        </p>

        {/* Training */}
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-forest">Training</h2>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Training courses</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">Course</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Type</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Status</th>
                <th scope="col" className="py-1.5 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody>
              {d.training.map((t) => {
                const c = courseById.get(t.courseId);
                return (
                  <tr key={t.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-3">{c?.title ?? "Course"}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground capitalize">{(c?.kind ?? "").toLowerCase()}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{t.status === "COMPLETED" ? "Completed" : "In progress"}</td>
                    <td className="py-1.5 text-muted-foreground">{fmt(t.completedAt)}</td>
                  </tr>
                );
              })}
              {d.training.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-2 text-muted-foreground">No training recorded.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </section>

        {/* PD */}
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-forest">Professional development</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{d.pdHours.toFixed(1)} hours total</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Professional-development records</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">Activity</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Source</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Date</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Hours</th>
                <th scope="col" className="py-1.5 font-medium">Verified</th>
              </tr>
            </thead>
            <tbody>
              {d.pd.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-1.5 pr-3">{r.title}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{r.source ?? "-"}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{fmt(r.date)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{Number(r.hours).toFixed(1)}</td>
                  <td className="py-1.5 text-muted-foreground">{r.verified ? "Yes" : "-"}</td>
                </tr>
              ))}
              {d.pd.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-2 text-muted-foreground">No records.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </section>

        <p className="mt-8 border-t border-border pt-3 text-xs text-muted-foreground">
          Generated by the Mount Etna Employee Hub. This transcript reflects records at the time of generation.
        </p>
      </div>
    </>
  );
}
