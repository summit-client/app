"use client";

import * as React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { CourseCard } from "@/components/marketing/course-card";
import { CourseQuickView } from "@/components/marketing/course-quick-view";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  courses,
  courseTopics,
  courseLevels,
  deliveryMethods,
  type AcademySlug,
  type Course,
} from "@/content/courses";
import { enabledLanguages } from "@/content/languages";

const academyOptions: { value: AcademySlug; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
  { value: "teacher", label: "Teacher" },
  { value: "clinical", label: "Clinical" },
  { value: "digital", label: "Digital" },
];

export function CourseCatalogue({ initialAcademy = "" }: { initialAcademy?: string }) {
  const [q, setQ] = React.useState("");
  const [academy, setAcademy] = React.useState(initialAcademy);
  const [level, setLevel] = React.useState("");
  const [delivery, setDelivery] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [language, setLanguage] = React.useState("");
  const [access, setAccess] = React.useState("");
  const [quick, setQuick] = React.useState<Course | null>(null);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return courses.filter((c) => {
      if (needle && !`${c.title} ${c.summary} ${c.topic}`.toLowerCase().includes(needle)) return false;
      if (academy && c.academy !== academy) return false;
      if (level && c.level !== level) return false;
      if (delivery && c.delivery !== delivery) return false;
      if (topic && c.topic !== topic) return false;
      if (language && !c.languages.includes(language)) return false;
      if (access === "free" && c.price !== "Free") return false;
      if (access === "paid" && (c.price === "Free" || c.price === "Institutional")) return false;
      if (access === "institutional" && !c.institutionalOnly) return false;
      return true;
    });
  }, [q, academy, level, delivery, topic, language, access]);

  const reset = () => {
    setQ("");
    setAcademy("");
    setLevel("");
    setDelivery("");
    setTopic("");
    setLanguage("");
    setAccess("");
  };

  const hasFilters = q || academy || level || delivery || topic || language || access;

  return (
    <div>
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses…"
            aria-label="Search courses"
            className="pl-9"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="sr-only" htmlFor="f-academy">
            Academy
          </label>
          <Select id="f-academy" value={academy} onChange={(e) => setAcademy(e.target.value)} aria-label="Academy">
            <option value="">All academies</option>
            {academyOptions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label} Academy
              </option>
            ))}
          </Select>

          <Select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
            <option value="">All levels</option>
            {courseLevels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>

          <Select value={delivery} onChange={(e) => setDelivery(e.target.value)} aria-label="Delivery">
            <option value="">All delivery methods</option>
            {deliveryMethods.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>

          <Select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
            <option value="">All topics</option>
            {courseTopics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          <Select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
            <option value="">All languages</option>
            {enabledLanguages().map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>

          <Select value={access} onChange={(e) => setAccess(e.target.value)} aria-label="Access">
            <option value="">All access types</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
            <option value="institutional">Institutional only</option>
          </Select>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span aria-live="polite">
              {filtered.length} {filtered.length === 1 ? "course" : "courses"}
            </span>
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 font-medium text-forest hover:underline"
            >
              <X className="h-4 w-4" aria-hidden />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {filtered.length ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CourseCard key={c.slug} course={c} onQuickView={setQuick} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-lg font-semibold">No courses match your filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Try broadening your search.</p>
          <Button onClick={reset} variant="outline" className="mt-4">
            Clear filters
          </Button>
        </div>
      )}

      <CourseQuickView course={quick} onClose={() => setQuick(null)} />
    </div>
  );
}
