import { HubSectionPlaceholder } from "@/components/hub/section-placeholder";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildMetadata({ title: "Help", path: "/hub/help", noindex: true });

export default function HubSectionPage() {
  return <HubSectionPlaceholder title="Help" blurb="Guidance and support for using the Mount Etna Employee Hub." phase="Soon" />;
}
