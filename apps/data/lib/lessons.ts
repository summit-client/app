/**
 * The Lesson Plan Bank.
 *
 * Group programming: 22 programmes across 8 clusters, with the resources and
 * group goals each carries. Distinct from the goal bank, which holds individual
 * clinical targets - a lesson plan is what a group does for twelve weeks, a
 * goal is what one child is measured on.
 */
import { createBrowserClient } from "@supabase/ssr";

export const IS_PREVIEW =
  process.env.NEXT_PUBLIC_DEV_PREVIEW === "1" && process.env.NODE_ENV !== "production";

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

export type LessonProgram = {
  id: string;
  name: string;
  clusterId: string | null;
  clusterName: string | null;
  focus: string | null;
  description: string | null;
  ageRange: string | null;
  format: string | null;
  groupSize: string | null;
  setting: string | null;
  duration: string | null;
  weeks: number | null;
  model: string | null;
  dayTime: string | null;
  status: string;
  driveUrl: string | null;
  resourceCount: number;
  goalCount: number;
};

export type LessonResource = {
  id: string;
  name: string;
  kind: string;
  note: string | null;
  url: string | null;
  containsClientInfo: boolean;
};

export type LessonGoal = {
  id: string;
  goal: string;
  targetBehavior: string | null;
  objective: string | null;
  measurement: string | null;
  dataCollectionMethod: string | null;
  frequency: string | null;
};

const PREVIEW_PROGRAMS: LessonProgram[] = [
  {
    id: "p-molten", name: "Molten Meals", clusterId: "cooking-life-skills",
    clusterName: "Cooking & Life Skills", focus: "Cooking & kitchen life skills",
    description: "A 12-week ABA cooking group teaching kitchen safety, food preparation and following recipes.",
    ageRange: null, format: "In-person small-group cooking instruction (ABA)",
    groupSize: "Small group", setting: "Kitchen / group room", duration: "~2 hours/session; 12 weeks",
    weeks: 12, model: "Task analysis + chaining", dayTime: "Tuesday, 2 hrs",
    status: "Approved", driveUrl: null, resourceCount: 4, goalCount: 3,
  },
  {
    id: "p-move", name: "Movement & Music", clusterId: "movement-music",
    clusterName: "Movement & Music", focus: "Gross motor, coordination and regulation",
    description: "Dance and music groups targeting coordination, imitation and joint engagement.",
    ageRange: null, format: "In-person group", groupSize: "Small group",
    setting: "Group room", duration: "8 weeks", weeks: 8, model: "Imitation + shaping",
    dayTime: "Thursday", status: "Approved", driveUrl: null, resourceCount: 2, goalCount: 2,
  },
];

/** How a resource's sensitivity should read. Never a colour alone. */
export function sensitivityLabel(r: LessonResource): string | null {
  return r.containsClientInfo ? "Contains client information" : null;
}

/**
 * Group programmes by cluster, in the taxonomy's own order where there is one.
 *
 * Alphabetical would scatter "Summer Camp & Seasonal" into the middle of the
 * therapeutic clusters; the library's own grouping is the one clinicians use.
 */
export function byCluster(programs: LessonProgram[]): { cluster: string; programs: LessonProgram[] }[] {
  const map = new Map<string, LessonProgram[]>();
  for (const p of programs) {
    const key = p.clusterName ?? "Other";
    const list = map.get(key);
    if (list) list.push(p); else map.set(key, [p]);
  }
  return [...map.entries()]
    .map(([cluster, ps]) => ({
      cluster,
      programs: [...ps].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.cluster.localeCompare(b.cluster));
}

export function matches(p: LessonProgram, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.focus, p.description, p.model, p.setting, p.clusterName]
    .filter(Boolean).join(" ").toLowerCase().includes(q);
}

export async function getPrograms(): Promise<LessonProgram[]> {
  if (IS_PREVIEW) return PREVIEW_PROGRAMS;
  const { data, error } = await sb()
    .from("lesson_plan_catalogue").select("*").order("name", { ascending: true }).limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    clusterId: (r.cluster_id as string | null) ?? null,
    clusterName: (r.cluster_name as string | null) ?? null,
    focus: (r.focus as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    ageRange: (r.age_range as string | null) ?? null,
    format: (r.format as string | null) ?? null,
    groupSize: (r.group_size as string | null) ?? null,
    setting: (r.setting as string | null) ?? null,
    duration: (r.duration as string | null) ?? null,
    weeks: r.weeks == null ? null : Number(r.weeks),
    model: (r.model as string | null) ?? null,
    dayTime: (r.day_time as string | null) ?? null,
    status: (r.status as string) ?? "Approved",
    driveUrl: (r.drive_url as string | null) ?? null,
    resourceCount: Number(r.resource_count ?? 0),
    goalCount: Number(r.goal_count ?? 0),
  }));
}

export async function getResources(programId: string): Promise<LessonResource[]> {
  if (IS_PREVIEW) {
    return [
      { id: "r1", name: "Kitchen safety visual", kind: "visual", note: null,
        url: null, containsClientInfo: false },
      { id: "r2", name: "Completed datasheet (Spring 2026)", kind: "datasheet",
        note: "Filled datasheets from the previous run.", url: null, containsClientInfo: true },
    ];
  }
  const { data, error } = await sb()
    .from("lesson_resources")
    .select("id, name, kind, note, url, contains_client_info")
    .eq("program_id", programId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    kind: (r.kind as string) ?? "other",
    note: (r.note as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    containsClientInfo: Boolean(r.contains_client_info),
  }));
}

export async function getGoals(programId: string): Promise<LessonGoal[]> {
  if (IS_PREVIEW) {
    return [{ id: "g1", goal: "Follows a 4-step recipe", targetBehavior: "Completes each step in order",
      objective: null, measurement: "Percentage of steps independent",
      dataCollectionMethod: "Task analysis", frequency: "Every session" }];
  }
  const { data, error } = await sb()
    .from("lesson_program_goals")
    .select("id, goal, target_behavior, objective, measurement, data_collection_method, frequency")
    .eq("program_id", programId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    goal: r.goal as string,
    targetBehavior: (r.target_behavior as string | null) ?? null,
    objective: (r.objective as string | null) ?? null,
    measurement: (r.measurement as string | null) ?? null,
    dataCollectionMethod: (r.data_collection_method as string | null) ?? null,
    frequency: (r.frequency as string | null) ?? null,
  }));
}
