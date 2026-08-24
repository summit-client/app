import { HubSectionPlaceholder } from "@/components/hub/section-placeholder";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "My Profile", path: "/hub/profile", noindex: true });

export default function HubSectionPage() {
  return <HubSectionPlaceholder title="My Profile" blurb="Your employee record: name, ID, role, site, supervisor, start date and status." phase="Phase 4" />;
}
