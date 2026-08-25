import type { RetrievedClinicalData } from "@summit/clinical-ai";

/**
 * Preview retrieval for the report pipeline — synthetic data only (the mock
 * provider is the only model that ever sees it). Reuses the attention fixtures
 * and adds synthetic session-note excerpts so theme extraction and the
 * note–data consistency engine both exercise.
 */
export async function getPreviewRetrieval(clientId: number): Promise<RetrievedClinicalData> {
  const { getCaseloadFacts } = await import("./facts");
  const all = await getCaseloadFacts();
  const facts = all.filter((f) => f.clientId === clientId);
  const name = facts[0]?.clientName ?? `Client ${clientId}`;

  const notes = facts.flatMap((f, i) => [
    {
      id: `note-${f.programId}-a`, date: f.series.at(-2)?.date ?? f.series[0]?.date ?? "",
      excerpts: [
        f.noteThemes.includes("prompt dependency")
          ? `Observed continued prompt dependency during ${f.goalName}; improvement noted with familiar therapist.`
          : `Session ran ${f.goalName}; steady engagement observed.`,
      ],
      programIds: [f.programId],
    },
    ...(i === 0 ? [{
      id: `note-${f.programId}-b`, date: f.series.at(-1)?.date ?? "",
      excerpts: [
        `Parent reports more spontaneous requesting at home this week.`,
        `Plan: continue current prompt-fading step next session.`,
      ],
      programIds: [f.programId],
    }] : []),
  ]);

  return {
    client: { id: clientId, displayName: name },
    clinicId: null,
    facts,
    notes,
    incidents: clientId === 202
      ? [{ id: "inc-1", date: facts[0]?.series.at(-1)?.date ?? "", suspectedFunction: "escape_avoidance" }]
      : [],
    clinicalEvents: [],
    caregiverGoals: { open: 1, addressed: 1, reports: ["Wants ordering food independently prioritized."] },
    sessionsHeld: Math.max(...facts.map((f) => f.series.length), 0),
  };
}
