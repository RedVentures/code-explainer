import { LlmProvider } from "./LlmProvider";
import { PromptInput, ProviderConfig } from "../../models/types";

export class OpenAIProvider implements LlmProvider {
  public readonly id = "openai";

  public constructor(private readonly config: ProviderConfig) {}

  public async validateConfig(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error("Missing OpenAI API key. Set codeExplainer.openai.apiKey.");
    }
  }

  public async generate(input: PromptInput): Promise<string> {
    await this.validateConfig();

    const response = await fetch(`${this.config.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI response did not contain any content.");
    }

    return content;
  }
}
