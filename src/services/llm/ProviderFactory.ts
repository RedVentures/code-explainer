import * as vscode from "vscode";
import { ProviderConfig } from "../../models/types";
import { AnthropicProvider } from "./AnthropicProvider";
import { LlmProvider } from "./LlmProvider";
import { OpenAIProvider } from "./OpenAIProvider";

export function getProviderConfig(): ProviderConfig {
  const config = vscode.workspace.getConfiguration("codeExplainer");
  const provider = config.get<"openai" | "anthropic">("provider", "openai");

  if (provider === "anthropic") {
    return {
      provider,
      apiKey: config.get<string>("anthropic.apiKey", ""),
      model: config.get<string>("anthropic.model", "claude-3-7-sonnet-latest"),
      baseUrl: config.get<string>("anthropic.baseUrl"),
    };
  }

  return {
    provider: "openai",
    apiKey: config.get<string>("openai.apiKey", ""),
    model: config.get<string>("openai.model", "gpt-4.1-mini"),
    baseUrl: config.get<string>("openai.baseUrl"),
  };
}

export function createProvider(config: ProviderConfig): LlmProvider {
  return config.provider === "anthropic"
    ? new AnthropicProvider(config)
    : new OpenAIProvider(config);
}
