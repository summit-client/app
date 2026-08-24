import Link from "next/link";
import { Clock, Globe2, GraduationCap, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Course } from "@/content/courses";

const academyLabel: Record<Course["academy"], string> = {
  student: "Student",
  parent: "Parent",
  teacher: "Teacher",
  clinical: "Clinical",
  digital: "Digital",
};

const cardClass =
  "group flex w-full flex-col rounded-lg border border-border bg-card p-4 text-left shadow-card transition-colors duration-150 hover:border-forest/40";

/**
 * Course card. By default it links to the full course page. When `onQuickView`
 * is supplied (e.g. in the catalogue), the card instead opens a quick-view
 * sheet, progressive disclosure without leaving the list.
 */
export function CourseCard({
  course,
  onQuickView,
}: {
  course: Course;
  onQuickView?: (course: Course) => void;
}) {
  const price =
    course.price === "Free"
      ? "Free"
      : course.price === "Institutional"
        ? "Institutional"
        : `$${course.price}`;

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <Badge tone="sage">{academyLabel[course.academy]} Academy</Badge>
        <span className="text-sm font-semibold text-forest">{price}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold group-hover:text-forest">{course.title}</h3>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{course.summary}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden />
          {course.level}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {course.durationHours}h · {course.delivery}
        </span>
        <span className="inline-flex items-center gap-1">
          <Globe2 className="h-3.5 w-3.5" aria-hidden />
          {course.languages.length} languages
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {/* COMPLIANCE: only surface certificate/CEU when verified in CMS. */}
        {course.certificate && course.verifiedStatus ? <Badge tone="outline">Certificate</Badge> : null}
        {course.ceu && course.verifiedStatus ? <Badge tone="outline">CEU</Badge> : null}
        {course.institutionalOnly ? <Badge tone="stone">Institutional access</Badge> : null}
        {onQuickView ? (
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-forest opacity-0 transition-opacity group-hover:opacity-100">
            <Eye className="h-4 w-4" aria-hidden />
            Quick view
          </span>
        ) : null}
      </div>
    </>
  );

  if (onQuickView) {
    return (
      <button type="button" onClick={() => onQuickView(course)} className={cardClass}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={`/courses/${course.slug}`} className={cardClass}>
      {inner}
    </Link>
  );
}
