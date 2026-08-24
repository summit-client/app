import { requireHubUser } from "@/lib/hub/auth";
import { prisma } from "@/lib/prisma";
import { PdManager, type PdVM } from "@/components/hub/pd-manager";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Professional Development", path: "/hub/pd", noindex: true });

export default async function PdPage() {
  const user = await requireHubUser();
  const records = await prisma.hubPdRecord.findMany({
    where: { employeeUserId: user.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const items: PdVM[] = records.map((r) => ({
    id: r.id,
    title: r.title,
    provider: r.provider,
    category: r.category,
    source: r.source,
    date: r.date?.toISOString() ?? null,
    hours: Number(r.hours),
    instructor: r.instructor,
    certificateUrl: r.certificateUrl,
    expiryDate: r.expiryDate?.toISOString() ?? null,
    verified: r.verified,
  }));
  const total = items.reduce((sum, r) => sum + r.hours, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Professional Development</h1>
        <p className="mt-1 text-muted-foreground">
          Your permanent learning record: internal, MEGBA, and external. Add anything you complete.
        </p>
      </header>
      <PdManager items={items} total={total} />
    </div>
  );
}
