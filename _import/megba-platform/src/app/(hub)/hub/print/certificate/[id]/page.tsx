import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getHubSessionUser } from "@/lib/hub/session";
import { PrintButton } from "@/components/hub/print-button";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Certificate", path: "/hub/print/certificate", noindex: true });

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "-";
}

export default async function CertificatePrintPage({ params }: { params: { id: string } }) {
  const user = await getHubSessionUser();
  const cert = await prisma.hubCertificate.findUnique({
    where: { id: params.id },
    include: { employee: { include: { profile: true } } },
  });
  if (!cert) notFound();
  const isOwner = user?.id === cert.employeeUserId;
  const isAdmin = user?.role === "ADMIN";
  if (!isOwner && !isAdmin) notFound();

  const p = cert.employee.profile;
  const name = p ? `${p.firstName} ${p.lastName}` : cert.employee.email;

  return (
    <>
      <style>{`@media print { @page { size: A4 landscape; margin: 14mm; } .no-print { display: none !important; } body { background: #fff; } }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <Link href={isAdmin && !isOwner ? `/hub/admin/${cert.employeeUserId}` : "/hub/certificates"} className="text-sm text-forest hover:underline">
          ← Back
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="relative overflow-hidden rounded-xl border-4 border-forest bg-white p-10 sm:p-14">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-forest-50" aria-hidden />
          <div className="relative text-center">
            <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-forest">Mount Etna Global Behaviour Academy</p>
            <p className="mt-8 text-xs uppercase tracking-[0.25em] text-muted-foreground">Certificate of Completion</p>
            <p className="mt-6 text-sm text-charcoal/70">This certifies that</p>
            <h1 className="mt-2 break-words font-display text-3xl font-bold text-forest sm:text-5xl">{name}</h1>
            <p className="mt-6 text-sm text-charcoal/70">has successfully completed</p>
            <p className="mt-2 text-xl font-semibold sm:text-2xl">{cert.title}</p>
            {cert.competency ? <p className="mt-1 text-sm text-muted-foreground">{cert.competency}</p> : null}

            <div className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-6 border-t border-border pt-6 text-left text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Certificate no.</div>
                <div className="font-medium tabular-nums">{cert.certNumber}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Issued</div>
                <div className="font-medium">{fmt(cert.issuedDate)}</div>
              </div>
              {cert.trainingHours != null ? (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Hours</div>
                  <div className="font-medium tabular-nums">{Number(cert.trainingHours).toFixed(1)}</div>
                </div>
              ) : null}
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Expires</div>
                <div className="font-medium">{cert.expiryDate ? fmt(cert.expiryDate) : "No expiry"}</div>
              </div>
            </div>

            <div className="mx-auto mt-10 flex max-w-2xl items-end justify-between gap-6">
              <div className="flex-1 text-left">
                <div className="border-b border-charcoal/40 pb-1 text-sm font-medium">{cert.instructor ?? "Mount Etna Clinical Team"}</div>
                <div className="mt-1 text-xs text-muted-foreground">Authorised signatory</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                Verified · {cert.verifyStatus === "VERIFIED" ? "Issued by Mount Etna" : "Pending"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
