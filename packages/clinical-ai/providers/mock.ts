import type {
  AuthorizedClinicalContext, ClinicalAIProvider, ClinicalDecisionEvidence, ClinicalDecisionTree,
  ClinicalEvidencePacket, ClinicalQuery, ClinicalQueryResponse, GeneratedClinicalReport,
  NoteEvidenceInput, ReportBlock, ReportGenerationOptions, StructuredNoteThemes,
  TreatmentPlanningEvidence, TreatmentPlanSuggestions,
} from "../types";

/**
 * Deterministic mock provider — synthetic/dev preview and provider-outage
 * demos. Generates narrative purely by templating the evidence packet, so the
 * full pipeline (packet → draft → validation → review workspace) runs with no
 * external calls and no keys. Also documents, executably, what "language from
 * evidence" means: every sentence below is a restatement of packet values.
 */
export class MockProvider implements ClinicalAIProvider {
  readonly name = "mock";
  readonly phiApproved = true; // synthetic data only — the router sends it nothing real outside preview

  async extractNoteThemes(input: NoteEvidenceInput): Promise<StructuredNoteThemes> {
    const all = input.notes.flatMap((n) => n.excerpts.map((e) => ({ e, id: n.id })));
    const pick = (re: RegExp) =>
      all.filter((x) => re.test(x.e)).map((x) => ({ theme: x.e, sourceNoteIds: [x.id] }));
    return {
      documentedStrengths: pick(/improv|independent|spontaneous|success/i),
      documentedBarriers: pick(/prompt depend|frustrat|barrier|refus/i),
      environmentalChanges: pick(/setting|environment|schedule change/i),
      caregiverReports: pick(/parent|caregiver|mother|father/i),
      clinicianObservations: pick(/observed|noted/i),
      plannedChanges: pick(/plan|next session|will/i),
      repeatedThemes: [],
    };
  }

  async draftProgressReport(p: ClinicalEvidencePacket, options: ReportGenerationOptions): Promise<GeneratedClinicalReport> {
    const parent = options.tone === "parent_friendly";
    const blocks: Omit<ReportBlock, "blockId" | "validation" | "reviewState">[] = [];

    blocks.push({
      section: "Service Summary",
      text: `${p.serviceSummary.sessionsAnalyzed} sessions were analyzed between ${p.reportingPeriod.start} and ${p.reportingPeriod.end}.`,
      evidenceIds: ["service_summary"],
      evidenceType: "derived_metric",
      confidence: "high",
    });

    for (const g of p.goals) {
      const lines: string[] = [];
      if (g.baselinePct != null && g.currentMeanPct != null) {
        lines.push(
          parent
            ? `${g.goalName}: performance moved from ${g.baselinePct}% to ${g.currentMeanPct}% this period.`
            : `${g.goalName}: mean independent performance changed from a baseline of ${g.baselinePct}% to ${g.currentMeanPct}% across ${g.sessionsAnalyzed} sessions (${g.opportunitiesAnalyzed} opportunities).`,
        );
      } else {
        lines.push(`${g.goalName}: ${g.sessionsAnalyzed} sessions were recorded this period.`);
      }
      if (g.masteryStatus === "approaching") lines.push(`Performance is approaching the mastery criterion (${g.masteryCriteria}).`);
      if (g.masteryStatus === "mastered") lines.push(`The mastery criterion (${g.masteryCriteria}) was met this period.`);
      if (g.treatmentIntegrityPct != null) lines.push(`Treatment integrity was ${g.treatmentIntegrityPct}%.`);
      if (g.caregiverReports.length) lines.push(`The caregiver reported: ${g.caregiverReports[0]} Direct measurement of this report was not available.`);
      if (g.consistency.status !== "CONSISTENT") lines.push(`${g.consistency.detail} Clinician review recommended.`);
      blocks.push({
        section: g.goalName,
        text: lines.join(" "),
        evidenceIds: [`metric_${g.programId}`, ...g.sourceReferences.slice(0, 3).map((s) => s.id)],
        evidenceType: g.caregiverReports.length ? "caregiver_report" : "derived_metric",
        confidence: g.consistency.status === "CONSISTENT" ? "high" : "moderate",
      });
    }

    if (p.behaviourSummary.incidents > 0) {
      blocks.push({
        section: "Behaviour",
        text: `${p.behaviourSummary.incidents} behaviour incidents were documented this period.`,
        evidenceIds: p.behaviourSummary.sourceReferences.map((s) => s.id),
        evidenceType: "objective_data",
        confidence: "high",
      });
    }
    if (p.dataQualityFlags.length) {
      blocks.push({
        section: "Data Quality",
        text: `Data-quality flags for clinician attention: ${p.dataQualityFlags.join("; ")}.`,
        evidenceIds: ["data_quality"],
        evidenceType: "derived_metric",
        confidence: "high",
      });
    }

    return {
      reportId: `rep-${p.packetId}`,
      packetId: p.packetId,
      modelNote: "mock · deterministic template · clinical-v1",
      blocks: blocks.map((b, i) => ({
        ...b, blockId: `blk-${i}`,
        validation: { status: "verified", unsupportedValues: [] },
        reviewState: "pending",
      })),
    };
  }

  async generateTreatmentPlanSuggestions(ev: TreatmentPlanningEvidence): Promise<TreatmentPlanSuggestions> {
    return {
      suggestions: ev.goalBankNextOptions.flatMap((g) =>
        g.options.map((o) => ({
          goalName: o, source: "goal_bank" as const,
          rationale: "Approved linked progression in the organization Goal Bank.",
          evidenceIds: [g.goalId],
        })),
      ),
    };
  }

  async generateDecisionTree(ev: ClinicalDecisionEvidence): Promise<ClinicalDecisionTree> {
    return {
      pattern: ev.pattern,
      candidateCauses: [
        { cause: "Reinforcement thinned too fast", confidencePct: 51, rationale: "Pattern followed a schedule change." },
        { cause: "Mastery criteria too strict", confidencePct: 32, rationale: "Performance stable just below criterion." },
        { cause: "Generalization issue", confidencePct: 17, rationale: "Performance varies by context." },
      ],
      actions: [
        { option: "Densify reinforcement", plan: "Return to the previous schedule for 2 weeks." },
        { option: "Phase change with intermediate step", plan: "Insert an intermediate prompt level." },
        { option: "FBA-lite", plan: "Re-examine the SD via 3 ABC observations." },
      ],
      measurementPlan: "Re-measure at 2 weeks; success = at least 10% gain with no behavioural escalation.",
      escalation: "Auto-escalate to supervisor QA review if no gain by week 3.",
    };
  }

  async answerClinicalQuery(q: ClinicalQuery, _ctx: AuthorizedClinicalContext): Promise<ClinicalQueryResponse> {
    const s = q.question.toLowerCase();
    const filterId =
      /plateau/.test(s) && /integrity/.test(s) ? "plateau-high-integrity"
      : /master/.test(s) && /next/.test(s) ? "mastered-no-next"
      : /fewer|less than|sparse|data point/.test(s) ? "sparse-data"
      : /approaching|near/.test(s) ? "approaching-mastery"
      : /note/.test(s) && /data|stable/.test(s) ? "notes-vs-data"
      : null;
    return {
      filterId,
      explanation: filterId
        ? "Mapped to a deterministic caseload filter; the analytics engine computes the results."
        : "No deterministic filter matches this question yet; results would require a new analytics detector.",
    };
  }
}
