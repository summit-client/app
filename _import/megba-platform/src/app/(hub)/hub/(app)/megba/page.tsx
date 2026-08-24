import { HubSectionPlaceholder } from "@/components/hub/section-placeholder";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "MEGBA Learning", path: "/hub/megba", noindex: true });

export default function HubSectionPage() {
  return <HubSectionPlaceholder title="MEGBA Learning" blurb="Your internal MEGBA learning transcript: courses, competencies and completion." phase="Phase 6" />;
}
