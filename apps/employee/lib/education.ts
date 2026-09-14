/**
 * Academic education, separate from the regulatory credential rule engine in
 * credentials.ts. See migration 0070's header for why: a degree has no
 * cycle, no CEU requirement, and cannot lapse, so it does not belong in
 * employee_credentials or CREDENTIAL_RULES.
 */

export type EducationLevel =
  | "high_school" | "diploma" | "associate" | "bachelor" | "master" | "doctorate" | "other";

export const EDUCATION_LEVEL_LABEL: Record<EducationLevel, string> = {
  high_school: "High school",
  diploma: "Diploma / certificate",
  associate: "Associate degree",
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: "Doctorate",
  other: "Other",
};

/**
 * Rank used only to pick the "highest" of several records - not shown to
 * anyone. `other` ranks below every named level: it exists so an unusual
 * credential (e.g. a professional diploma with no clean bucket) can still be
 * recorded, not so it can outrank a named degree.
 */
export const EDUCATION_RANK: Record<EducationLevel, number> = {
  other: 0,
  high_school: 1,
  diploma: 2,
  associate: 3,
  bachelor: 4,
  master: 5,
  doctorate: 6,
};

export interface EmployeeEducation {
  id: string;
  level: EducationLevel;
  fieldOfStudy: string;
  institution: string;
  completedYear: number | null;
  verification: "SELF_REPORTED" | "VERIFIED";
}

/** The single highest-ranked record, for display as "highest level achieved".
 *  Derived at read time on purpose - see migration 0070's header. */
export function highestEducation(records: EmployeeEducation[]): EmployeeEducation | null {
  if (!records.length) return null;
  return records.slice().sort((a, b) => EDUCATION_RANK[b.level] - EDUCATION_RANK[a.level])[0];
}

/** How a highest-level record should read wherever it's shown compactly. */
export function educationLine(e: EmployeeEducation | null): string | null {
  if (!e) return null;
  const label = EDUCATION_LEVEL_LABEL[e.level];
  return e.fieldOfStudy ? `${label}, ${e.fieldOfStudy}` : label;
}
