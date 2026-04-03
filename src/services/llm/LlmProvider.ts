import { PromptInput } from "../../models/types";

export interface LlmProvider {
  readonly id: string;
  generate(input: PromptInput): Promise<string>;
  validateConfig(): Promise<void>;
}
