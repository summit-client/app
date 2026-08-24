import { notFound } from "next/navigation";
import { PortalApp } from "@/components/portal/portal-app";
import { buildMetadata } from "@/lib/seo";
import { getPortalConfig, portalSlugs } from "@/content/portal";

export function generateStaticParams() {
  return portalSlugs.map((role) => ({ role }));
}

export function generateMetadata({ params }: { params: { role: string } }) {
  const config = getPortalConfig(params.role);
  return buildMetadata({
    title: config ? config.name : "Portal",
    path: `/portal/${params.role}`,
    noindex: true,
  });
}

export default function PortalRolePage({ params }: { params: { role: string } }) {
  const config = getPortalConfig(params.role);
  if (!config) notFound();
  return <PortalApp config={config} />;
}
