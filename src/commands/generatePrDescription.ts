import * as vscode from "vscode";
import { PrDescriptionExplanation, PrDescriptionStyle, PrDescriptionStyleOption } from "../models/types";
import { NoBranchChangesError, PrDescriptionAnalysisService } from "../services/analysis/PrDescriptionAnalysisService";
import { ResultsPanel } from "../ui/webview/panel";
import { openFileRef } from "./shared";

type DraftPanelMessage =
  | {
      type: "prRegenerate";
      title: string;
      body: string;
      style: PrDescriptionStyle;
      customInstructions: string;
    }
  | {
      type: "prApply";
      title: string;
      body: string;
      style: PrDescriptionStyle;
      customInstructions: string;
    };

export function createGeneratePrDescriptionCommand(
  panel: ResultsPanel,
  analysisService: PrDescriptionAnalysisService
) {
  return async () => {
    const initialStyle = await promptForInitialStyle(analysisService.getAvailableStyles());
    if (!initialStyle) {
      return;
    }

    const renderResult = (result: PrDescriptionExplanation) => {
      panel.show(result, {
        onAction: () => undefined,
        onFileRef: (fileRef) => void openFileRef(fileRef),
        onRefresh: () => {
          void runAnalysis({
            style: result.style,
            customInstructions: result.customInstructions,
          }).catch((error) => {
            renderResult(result);
            const message = error instanceof Error ? error.message : "Unknown error";
            void vscode.window.showErrorMessage(`Code Explainer: ${message}`);
          });
        },
        onMessage: (message) => {
          void handlePanelMessage(message as DraftPanelMessage, result, renderResult).catch((error) => {
            renderResult(restoreDraftResult(result, message as DraftPanelMessage));
            const messageText = error instanceof Error ? error.message : "Unknown error";
            void vscode.window.showErrorMessage(`Code Explainer: ${messageText}`);
          });
        },
      });
    };

    const runAnalysis = async (options?: { style?: PrDescriptionStyle; customInstructions?: string }) => {
      panel.showLoading("Generate PR Description", "Reviewing the current branch and preparing a PR description draft.");
      try {
        const result = await analysisService.analyze(options);
        renderResult(result);
      } catch (error) {
        if (error instanceof NoBranchChangesError) {
          void vscode.window.showInformationMessage(error.message);
          return;
        }

        throw error;
      }
    };

    const handlePanelMessage = async (
      message: DraftPanelMessage,
      currentResult: PrDescriptionExplanation,
      render: (result: PrDescriptionExplanation) => void
    ) => {
      if (message.type === "prRegenerate") {
        await runAnalysis({
          style: message.style,
          customInstructions: message.customInstructions,
        });
        return;
      }

      if (message.type !== "prApply") {
        return;
      }

      panel.showLoading("Generate PR Description", "Applying the reviewed draft to GitHub.");
      const applied = await analysisService.applyDraft({
        draft: currentResult,
        title: message.title,
        body: message.body,
      });

      if (applied.status === "cancelled") {
        render({
          ...currentResult,
          draftTitle: message.title,
          draftBody: message.body,
          style: message.style,
          customInstructions: message.customInstructions,
        });
        return;
      }

      const updatedResult = analysisService.withAppliedDraft(
        {
          ...currentResult,
          style: message.style,
          customInstructions: message.customInstructions,
        },
        message.title,
        message.body,
        applied.pullRequest
      );
      render(updatedResult);

      const messageText = applied.status === "created"
        ? `Created pull request #${applied.pullRequest?.number}.`
        : `Updated pull request #${applied.pullRequest?.number}.`;
      const openAction = "Open PR";
      const selection = await vscode.window.showInformationMessage(messageText, openAction);
      if (selection === openAction && applied.pullRequest?.url) {
        await vscode.env.openExternal(vscode.Uri.parse(applied.pullRequest.url));
      }
    };

    await runAnalysis({ style: initialStyle });
  };
}

function restoreDraftResult(
  result: PrDescriptionExplanation,
  message: DraftPanelMessage
): PrDescriptionExplanation {
  if (message.type === "prRegenerate" || message.type === "prApply") {
    return {
      ...result,
      draftTitle: message.title,
      draftBody: message.body,
      style: message.style,
      customInstructions: message.customInstructions,
    };
  }

  return result;
}

function promptForInitialStyle(styles: PrDescriptionStyleOption[]): Thenable<PrDescriptionStyle | undefined> {
  const items = styles.map((style) => ({
    label: style.label,
    description: style.description,
    detail: style.isBuiltIn ? "Built-in style" : "Custom reusable style",
    style: style.id,
  }));

  return vscode.window.showQuickPick(items, {
    title: "Choose a PR description style",
    placeHolder: "Pick the audience/tone before generating the first draft.",
  }).then((selection) => selection?.style);
}
