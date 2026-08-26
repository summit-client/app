import { JsonChatProvider } from "./base";
import { ClinicalAIUnavailableError } from "../types";

/**
 * Azure OpenAI — the production provider for PHI workloads (deployed under the
 * organization's BAA). REST call, no SDK: clinical business logic never touches
 * a vendor SDK directly, and swapping providers is a routing change.
 *
 * Env (server-side only, never NEXT_PUBLIC_*):
 *   AZURE_OPENAI_ENDPOINT    https://<resource>.openai.azure.com
 *   AZURE_OPENAI_DEPLOYMENT  the deployed model name
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_API_VERSION (default 2024-06-01)
 */
export class AzureOpenAIProvider extends JsonChatProvider {
  readonly name = "azure_openai";
  readonly phiApproved = true;
  readonly model: string;
  private endpoint: string;
  private key: string;
  private apiVersion: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    super();
    this.endpoint = env.AZURE_OPENAI_ENDPOINT ?? "";
    this.model = env.AZURE_OPENAI_DEPLOYMENT ?? "";
    this.key = env.AZURE_OPENAI_API_KEY ?? "";
    this.apiVersion = env.AZURE_OPENAI_API_VERSION ?? "2024-06-01";
    if (!this.endpoint || !this.model || !this.key) {
      throw new ClinicalAIUnavailableError("Clinical AI is not configured in this environment.");
    }
  }

  protected async chatJSON(prompt: string): Promise<string> {
    const url = `${this.endpoint}/openai/deployments/${this.model}/chat/completions?api-version=${this.apiVersion}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": this.key },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new ClinicalAIUnavailableError();
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
}
