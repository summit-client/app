# Clinical Intelligence Architecture

This platform is an **AI-native clinical intelligence platform for behaviour
services**, not another data-collection system. Its moat is the connected
clinical reasoning chain:

> Atomic Data → Structured Clinical Context → Shared Goal Bank → Explainable AI
> → Clinician Decision → Auditable Documentation

Every rule below is enforceable in code review.

## Non-negotiable engineering principles

1. **AI never does the math.** Means, medians, rates, slopes, percentages,
   mastery thresholds, date windows, session counts — all computed by the
   deterministic analytics engine (`packages/analytics`). The LLM only
   organizes, compares, explains and drafts from computed results.

   ```
   Database → Deterministic Analytics Engine → Structured Evidence
            → LLM → Draft Narrative → Validation → Clinician
   ```

2. **Every conclusion carries evidence.** Any surfaced flag (plateau,
   regression, mastery candidate, insufficient data) ships with a structured
   evidence object answering "Why am I seeing this?" — sessions analyzed,
   opportunities, period means, slope, thresholds applied, phase changes in
   window, sufficiency check. No opaque scores.

3. **Structured results, not paragraphs.** Supervisor queries return typed
   result sets (client, goal, metrics, evidence, suggested Goal Bank links),
   rendered as cards/tables. Narrative is optional garnish, never the payload.

4. **Provenance on every suggestion.** Priority order when proposing
   programming: (1) client's existing programming → (2) organization Goal Bank
   → (3) approved clinical pathways → (4) assessment relationships → (5)
   general AI suggestion. The source label is part of the data model
   (`programs.source`, `suggestion.source`) and always displayed
   ("Suggested from Mount Etna Goal Bank", never bare "AI Generated" when an
   approved source exists).

5. **Evidence hierarchy is typed, never flattened.** `objective_observation`
   → `derived_metric` → `clinician_observation` → `caregiver_report` →
   `ai_inference`. A caregiver report is never restated as a measured fact.

6. **Time is first-class.** Phases, phase changes, treatment modifications and
   decisions are dated rows; any window can be compared before/after an event
   deterministically (`compareWindows`).

7. **Longitudinal memory is queryable.** Failed approaches, discontinued
   goals, prompt dependencies, caregiver priorities and past decisions live in
   `clinical_decisions` / `treatment_modifications` / `caregiver_goals` — and
   AI suggestions must check them ("a similar modification was trialed in
   October 2025 and discontinued").

8. **The clinician decides.** Every AI-adjacent flow ends in review → decide →
   sign; signed artifacts are immutable + amendable, versioned, and auditable.

## The knowledge graph (schema mapping)

```
CLIENT ─ has → GOAL/PROGRAM (programs.source: goal_bank|clinician|ai)
  PROGRAM ─ contains → TARGETS (program_steps)
          ─ measured by → DATA POINTS (trial_events via session_records)
          ─ summarized by → session_records.summary_* (graph source of truth)
          ─ runs in → PHASES (phases: baseline|intervention|maintenance|generalization)
          ─ changed by → TREATMENT MODIFICATIONS (treatment_modifications)
          ─ evaluated by → MASTERY RULE (programs.mastery_*, mastery_evaluations)
          ─ discussed in → SOAP/SESSION NOTES (session_notes, immutable+amendments)
          ─ reviewed in → CLINICAL DECISIONS (clinical_decisions, with outcomes)
          ─ sourced from / leads to → GOAL BANK (goal_bank_entries + goal_bank_relations:
              prerequisite | next | related | generalization | maintenance)
CLIENT ─ voiced through → CAREGIVER GOALS/REPORTS (caregiver_goals; evidence-typed)
CLIENT ─ assessed by → ASSESSMENTS (assessments)
Everything ─ logged to → clinical_audit_events
```

## Layers and where they live

| Layer | Location | Status |
|---|---|---|
| Atomic collection (8 modes) | `apps/data` session screens | built |
| Knowledge-graph schema | `supabase/migrations/0001`, `0002` | built |
| Deterministic analytics + evidence | `packages/analytics` | built |
| Attention engine ("what needs my attention") | `packages/analytics` → `apps/data/app/attention` | built |
| Goal Bank + provenance | `0002` + seeds; surfaced in attention/planning | schema + seed |
| Supervisor query engine | structured filters now; NL→filter translation is the LLM's only job later | filters built |
| Evidence-first reporting (10-step pipeline) | `packages/clinical-ai` (providers, packet, consistency, validation) + `apps/data` report workspace + migration 0003 | built |
| Organizational learning loop (de-identified) | aggregate views over goal_bank usage | later |

## The one job the LLM gets

Translating natural language into the structured query filters, drafting
narrative from evidence packets, and summarizing note themes — behind the same
hardened, role-gated gateway pattern as `/api/match` (auth required, model
pinned, inputs de-identified, outputs validated against the evidence packet
before display). Provider decision: **Azure OpenAI for all PHI workloads** (production default), behind the provider-agnostic `ClinicalAIProvider` interface; Anthropic remains for synthetic/dev and non-PHI tasks only, refused for PHI unless a BAA + zero-retention arrangement is formally configured.
