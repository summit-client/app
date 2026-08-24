import { requireHubUser } from "@/lib/hub/auth";

export const dynamic = "force-dynamic";

/** Clean, shell-free layout for printable documents (certificates, reports). */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireHubUser();
  return <div className="min-h-dvh bg-white text-charcoal">{children}</div>;
}
