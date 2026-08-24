import { redirect } from "next/navigation";
import { requireHubUser } from "@/lib/hub/auth";
import { prisma } from "@/lib/prisma";
import { HubProfileForm } from "@/components/hub/profile-form";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Set up your profile", path: "/hub/welcome", noindex: true });

export default async function HubWelcomePage() {
  const user = await requireHubUser();
  if (user.profile) redirect("/hub");

  const locations = await prisma.hubLocation.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="min-h-dvh bg-muted/40">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-megba.svg" alt="Mount Etna" className="h-10 w-auto" />
        </div>
        <h1 className="text-2xl font-semibold">Set up your profile</h1>
        <p className="mt-2 text-muted-foreground">
          A few details so we can personalise your hub and start your onboarding. You can update
          these later from your profile.
        </p>
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <HubProfileForm email={user.email} locations={locations} />
        </div>
      </div>
    </div>
  );
}
