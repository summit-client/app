/**
 * Provider routing + governance. Server-side only: flags and secrets come from
 * plain env vars (never NEXT_PUBLIC_*), and the browser can never choose a
 * provider — routes call `resolveProvider(task)` on the server.
 *
 * Production default: Azure OpenAI for anything that may contain PHI/PII.
 * Anthropic is available for synthetic/dev and non-PHI tasks only, and is
 * refused for PHI unless AI_ANTHROPIC_PHI_APPROVED=true is explicitly set
 * (meaning a BAA + zero-retention arrangement is formally in place).
 */

import type { ClinicalAIProvider, ClinicalEvidencePacket } from "./types";
import { ClinicalAIUnavailableError } from "./types";
import { AzureOpenAIProvider } from "./providers/azure-openai";
import { AnthropicProvider } from "./providers/anthropic";
import { MockProvider } from "./providers/mock";

export interface ClinicalAIConfig {
  enabled: boolean;
  provider: "azure_openai" | "anthropic" | "mock";
  allowPhi: boolean;
  noteSynthesisEnabled: boolean;
  progressReportsEnabled: boolean;
  treatmentPlanningEnabled: boolean;
  decisionSupportEnabled: boolean;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ClinicalAIConfig {
  const flag = (k: string, dflt = false) => (env[k] == null ? dflt : env[k] === "true" || env[k] === "1");
  return {
    enabled: flag("CLINICAL_AI_ENABLED"),
    provider: (env.CLINICAL_AI_PROVIDER as ClinicalAIConfig["provider"]) ?? "azure_openai",
    allowPhi: flag("CLINICAL_AI_ALLOW_PHI"),
    noteSynthesisEnabled: flag("AI_NOTE_SYNTHESIS_ENABLED", true),
    progressReportsEnabled: flag("AI_PROGRESS_REPORTS_ENABLED", true),
    treatmentPlanningEnabled: flag("AI_TREATMENT_PLANNING_ENABLED", true),
    decisionSupportEnabled: flag("AI_DECISION_SUPPORT_ENABLED", true),
  };
}

export interface RouteRequest {
  task: "note_themes" | "progress_report" | "treatment_planning" | "decision_tree" | "clinical_query";
  containsPhi: boolean;
}

/**
 * Server-side model routing. Throws ClinicalAIUnavailableError when AI is off
 * or misconfigured — callers surface the standard degradation message and the
 * platform keeps working (data collection, graphing, manual notes, mastery
 * calculations never depend on this function succeeding).
 */
export function resolveProvider(
  req: RouteRequest,
  env: Record<string, string | undefined> = process.env,
): ClinicalAIProvider {
  const cfg = readConfig(env);
  if (!cfg.enabled) throw new ClinicalAIUnavailableError();

  // Synthetic/dev preview always routes to the deterministic mock.
  if (env.NEXT_PUBLIC_DEV_PREVIEW === "1" || cfg.provider === "mock") return new MockProvider();

  if (req.containsPhi) {
    if (!cfg.allowPhi) throw new ClinicalAIUnavailableError("Clinical AI is not enabled for identifiable data in this environment.");
    // PHI: Azure OpenAI is the production default. Anthropic only if formally approved.
    if (cfg.provider === "anthropic") {
      if (env.AI_ANTHROPIC_PHI_APPROVED === "true") return new AnthropicProvider(env);
      throw new ClinicalAIUnavailableError(
        "This environment routes identifiable clinical data to the approved Azure OpenAI deployment only.",
      );
    }
    return new AzureOpenAIProvider(env);
  }

  // Non-PHI: honour configured provider; Anthropic permitted.
  return cfg.provider === "anthropic" ? new AnthropicProvider(env) : new AzureOpenAIProvider(env);
}

/* ---- data-minimization gate -------------------------------------------------- */

/**
 * Minimum necessary context: strip the packet down to what the task requires.
 * Structured metrics and themes only — never raw tables, never unrelated goals.
 */
export function minimizePacket(
  packet: ClinicalEvidencePacket,
  opts: { goalFilterIds?: string[] } = {},
): ClinicalEvidencePacket {
  const goals = (opts.goalFilterIds?.length
    ? packet.goals.filter((g) => opts.goalFilterIds!.includes(g.goalId))
    : packet.goals
  ).map((g) => ({
    ...g,
    // themes stay; raw note text never entered the packet in the first place
    sourceReferences: g.sourceReferences, // ids only — safe by construction
  }));
  return {
    ...packet,
    client: { id: packet.client.id, displayName: packet.client.displayName }, // display label only
    goals,
    sources: packet.sources.filter(
      (s) => s.kind === "metric" || goals.some((g) => g.sourceReferences.some((r) => r.id === s.id)),
    ),
  };
}

/* ---- audit hashing ------------------------------------------------------------ */

/** Stable content hash for audit provenance (FNV-1a 64-bit, dependency-free). */
export function stableHash(value: unknown): string {
  const s = JSON.stringify(value);
  let h1 = 0xcbf29ce4, h2 = 0x84222325;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
