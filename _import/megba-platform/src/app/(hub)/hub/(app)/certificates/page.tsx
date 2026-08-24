import Link from "next/link";
import { requireHubUserWithProfile } from "@/lib/hub/auth";
import { prisma } from "@/lib/prisma";
import { certStatus, certStatusLabel, type CertStatus } from "@/lib/hub/certificates";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "My Certificates", path: "/hub/certificates", noindex: true });

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "-";
}
const STATUS_CLS: Record<CertStatus, string> = {
  ACTIVE: "text-forest",
  NO_EXPIRY: "text-forest",
  EXPIRING_SOON: "text-ember-600",
  EXPIRED: "text-maple",
};

export default async function CertificatesPage() {
  const user = await requireHubUserWithProfile();
  const certificates = await prisma.hubCertificate.findMany({
    where: { employeeUserId: user.id },
    orderBy: { issuedDate: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">My Certificates</h1>
        <p className="mt-1 text-muted-foreground">MEGBA certificates you have earned. Open one to print or save as PDF.</p>
      </header>

      <section>
        {certificates.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {certificates.map((c) => {
              const status = certStatus(c.expiryDate);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.certNumber} · Issued {fmt(c.issuedDate)}
                      {c.expiryDate ? ` · Expires ${fmt(c.expiryDate)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${STATUS_CLS[status]}`}>{certStatusLabel[status]}</span>
                    <Link href={`/hub/print/certificate/${c.id}`} className="text-sm font-medium text-forest hover:underline">
                      Open
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-medium">No certificates yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Certificates issued by Mount Etna will appear here. Completing the Clinical Competency Training earns one.
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Reports</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/hub/print/report/onboarding/${user.id}`}
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            My onboarding report
          </Link>
          <Link
            href={`/hub/print/report/training/${user.id}`}
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            My training transcript
          </Link>
        </div>
      </section>
    </div>
  );
}
