import * as vscode from "vscode";
import { PrDescriptionExplanation, PrDescriptionStyle } from "../models/types";
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
    const initialStyle = await promptForInitialStyle();
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
          });
        },
        onMessage: (message) => {
          void handlePanelMessage(message as DraftPanelMessage, result, renderResult);
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

async function promptForInitialStyle(): Promise<PrDescriptionStyle | undefined> {
  const items: Array<{ label: string; description: string; style: PrDescriptionStyle }> = [
    {
      label: "Business stakeholder",
      description: "Non-technical, impact-focused, and concise.",
      style: "business-stakeholder",
    },
    {
      label: "Code collaborator",
      description: "Technical and implementation-aware.",
      style: "code-collaborator",
    },
    {
      label: "Manager",
      description: "Semi-technical and delivery-focused.",
      style: "manager",
    },
    {
      label: "Other",
      description: "Use your own custom instructions after generation.",
      style: "other",
    },
  ];

  const selection = await vscode.window.showQuickPick(items, {
    title: "Choose a PR description style",
    placeHolder: "Pick the audience/tone before generating the first draft.",
  });

  return selection?.style;
}
