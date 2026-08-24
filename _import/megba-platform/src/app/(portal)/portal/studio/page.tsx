import { capabilities } from "@/lib/providers";
import { StudioApp } from "@/components/studio/studio-app";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "AI Studio",
  path: "/portal/studio",
  noindex: true,
});

export default function StudioPage() {
  // Which providers are configured is read server-side from env.
  return <StudioApp caps={capabilities()} />;
}
