"use client";

import { Check, Clock, Globe2, GraduationCap, Layers } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Course } from "@/content/courses";
import { languages } from "@/content/languages";

const langLabel = (code: string) => languages.find((l) => l.code === code)?.label ?? code;

/** Quick-view sheet for a course, opened from the catalogue cards. */
export function CourseQuickView({ course, onClose }: { course: Course | null; onClose: () => void }) {
  const price =
    course?.price === "Free"
      ? "Free"
      : course?.price === "Institutional"
        ? "Institutional"
        : course
          ? `$${course.price}`
          : "";
  const showCert = !!course?.certificate && !!course?.verifiedStatus;
  const showCeu = !!course?.ceu && !!course?.verifiedStatus;

  return (
    <Sheet
      open={course !== null}
      onClose={onClose}
      title={course?.title ?? ""}
      description={course ? `${course.topic} · ${course.level}` : undefined}
      footer={
        course ? (
          <div className="flex flex-col gap-2">
            <Button href={`/courses/${course.slug}`} className="w-full">
              View full course page
            </Button>
            <Button href="/contact?topic=General enquiry" variant="outline" className="w-full">
              Enrol / enquire
            </Button>
          </div>
        ) : null
      }
    >
      {course ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="sage">{price}</Badge>
            {showCert ? <Badge tone="forest">Certificate</Badge> : null}
            {showCeu ? <Badge tone="forest">CEU</Badge> : null}
            {course.institutionalOnly ? <Badge tone="stone">Institutional access</Badge> : null}
          </div>

          <p className="text-sm text-muted-foreground">{course.summary}</p>

          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-4 text-sm">
            <Meta icon={GraduationCap} label="Level" value={course.level} />
            <Meta icon={Clock} label="Length" value={`${course.durationHours} hours`} />
            <Meta icon={Layers} label="Delivery" value={course.delivery} />
            <Meta icon={Globe2} label="Languages" value={String(course.languages.length)} />
          </dl>

          <div>
            <p className="text-sm font-semibold">You'll learn to</p>
            <ul className="mt-2 space-y-1.5">
              {course.objectives.map((o) => (
                <li key={o} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                  {o}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold">
              {course.modules.length} modules · Available in {course.languages.map(langLabel).join(", ")}
            </p>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
