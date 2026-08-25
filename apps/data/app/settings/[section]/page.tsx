"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { SECTIONS } from "@summit/settings";
import { GenericSection } from "@/components/settings/controls";
import {
  AppearanceSection, AutomationsSection, DashboardSection, EmailSection, IntegrationsSection,
  LanguageSection, NavigationSection, NotificationsSection, PrivacySection, RolesSection,
} from "@/components/settings/custom";

/** One route, every section: custom surfaces where interaction demands it, the
 * registry-driven renderer everywhere else. All of it reads and writes the same
 * central configuration service. */
export default function SettingsSectionPage() {
  const params = useParams<{ section: string }>();
  const section = SECTIONS.find((s) => s.slug === params.section);

  if (!section) return <p className="sub">This settings section does not exist.</p>;

  return (
    <div>
      <h1 className="h-page">{section.title}</h1>
      <p className="sub" style={{ maxWidth: "64ch" }}>{section.blurb}</p>
      <div style={{ marginTop: 18 }}>
        <SectionBody slug={section.slug} />
      </div>
    </div>
  );
}

function SectionBody({ slug }: { slug: string }) {
  switch (slug) {
    case "appearance": return <AppearanceSection />;
    case "language": return <LanguageSection />;
    case "dashboard": return <DashboardSection />;
    case "navigation": return <NavigationSection />;
    case "notifications": return <NotificationsSection />;
    case "email": return <EmailSection />;
    case "roles": return <RolesSection />;
    case "integrations": return <IntegrationsSection />;
    case "tasks-automations": return <AutomationsSection />;
    case "privacy": return <PrivacySection />;
    case "forms": return <GenericSection slug="forms" />;
    default: return <GenericSection slug={slug} />;
  }
}
