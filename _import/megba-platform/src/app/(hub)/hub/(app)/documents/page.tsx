import { HubSectionPlaceholder } from "@/components/hub/section-placeholder";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "My Documents", path: "/hub/documents", noindex: true });

export default function HubSectionPage() {
  return <HubSectionPlaceholder title="My Documents" blurb="Handbook, policies, forms and resources, linked to the Team Drive." phase="Phase 6" />;
}
