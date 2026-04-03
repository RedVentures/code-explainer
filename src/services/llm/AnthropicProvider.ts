import { LlmProvider } from "./LlmProvider";
import { PromptInput, ProviderConfig } from "../../models/types";

export class AnthropicProvider implements LlmProvider {
  public readonly id = "anthropic";

  public constructor(private readonly config: ProviderConfig) {}

  public async validateConfig(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error("Missing Anthropic API key. Set codeExplainer.anthropic.apiKey.");
    }
  }

  public async generate(input: PromptInput): Promise<string> {
    await this.validateConfig();

    const response = await fetch(`${this.config.baseUrl ?? "https://api.anthropic.com/v1"}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 1200,
        temperature: 0.2,
        system: input.system,
        messages: [
          {
            role: "user",
            content: input.user,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    const content = json.content?.find((entry) => entry.type === "text")?.text?.trim();
    if (!content) {
      throw new Error("Anthropic response did not contain any text.");
    }

    return content;
  }
}
