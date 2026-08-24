import { Container, Section } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { CourseCatalogue } from "@/components/marketing/course-catalogue";
import { CTASection } from "@/components/marketing/cta-section";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Course Catalogue",
  path: "/courses",
  description:
    "Browse MEGBA's course catalogue across the Student, Parent, Teacher, Clinical, and Digital academies.",
});

export default function CoursesPage({ searchParams }: { searchParams: { academy?: string } }) {
  return (
    <>
      <PageHero
        eyebrow="Course catalogue"
        title="Find the right course"
        description="Search and filter courses by audience, academy, topic, level, language, delivery, and access."
        crumbs={[{ name: "Home", href: "/" }, { name: "Courses" }]}
      />
      <Section>
        <Container>
          <CourseCatalogue initialAcademy={searchParams.academy ?? ""} />
        </Container>
      </Section>
      <CTASection />
    </>
  );
}
