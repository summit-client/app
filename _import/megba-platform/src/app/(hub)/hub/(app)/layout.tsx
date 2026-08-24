import { requireHubUserWithProfile } from "@/lib/hub/auth";
import { HubShell } from "@/components/hub/hub-shell";

export const dynamic = "force-dynamic";

export default async function HubAppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireHubUserWithProfile();
  const p = user.profile!;
  const fullName = `${p.firstName} ${p.lastName}`.trim();

  return (
    <HubShell
      firstName={p.firstName}
      fullName={fullName}
      employeeNumber={p.employeeNumber}
      role={user.role as "EMPLOYEE" | "ADMIN"}
    >
      {children}
    </HubShell>
  );
}
