import { JsonChatProvider } from "./base";
import { ClinicalAIUnavailableError } from "../types";

/**
 * Anthropic — development with synthetic data, non-PHI tasks, and internal
 * product assistance. NOT PHI-approved by default: the router refuses to send
 * identifiable clinical data here unless AI_ANTHROPIC_PHI_APPROVED=true is set,
 * which asserts a BAA + zero-data-retention arrangement is formally in place.
 * (This is deliberately a different key path from the scheduler's match route.)
 *
 * Env: CLINICAL_AI_ANTHROPIC_KEY, CLINICAL_AI_ANTHROPIC_MODEL (default haiku).
 */
export class AnthropicProvider extends JsonChatProvider {
  readonly name = "anthropic";
  readonly phiApproved: boolean;
  readonly model: string;
  private key: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    super();
    this.key = env.CLINICAL_AI_ANTHROPIC_KEY ?? "";
    this.model = env.CLINICAL_AI_ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
    this.phiApproved = env.AI_ANTHROPIC_PHI_APPROVED === "true";
    if (!this.key) throw new ClinicalAIUnavailableError("Clinical AI is not configured in this environment.");
  }

  protected async chatJSON(prompt: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new ClinicalAIUnavailableError();
    const data = (await res.json()) as { content?: { text?: string }[] };
    return (data.content ?? []).map((b) => b.text ?? "").join("");
  }
}
