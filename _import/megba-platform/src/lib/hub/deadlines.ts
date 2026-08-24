/** Deadline-bucket → day offset from the hire date. CUSTOM has no fixed offset. */
export const DEADLINE_OFFSET_DAYS: Record<string, number | null> = {
  WEEK_1: 7,
  WEEK_2: 14,
  WITHIN_14_DAYS: 14,
  WITHIN_30_DAYS: 30,
  CUSTOM: null,
};

export function computeDueDate(
  hireDate: Date | null,
  bucket: string,
  customOffsetDays?: number | null,
): Date | null {
  if (!hireDate) return null;
  const offset = bucket === "CUSTOM" ? customOffsetDays ?? null : DEADLINE_OFFSET_DAYS[bucket] ?? null;
  if (offset == null) return null;
  return new Date(hireDate.getTime() + offset * 86_400_000);
}
