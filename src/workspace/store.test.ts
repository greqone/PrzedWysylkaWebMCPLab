import { describe, expect, test } from "vitest";

import type { ValidationResult } from "../validation/types";

type StoreModule = {
  createWorkspaceStore(options?: {
    now?: () => string;
    createId?: () => string;
    canStageReplacements?: (assetId: string) => boolean;
  }): {
    getState(): {
      selectedAssetId: string | null;
      originalContent: string | null;
      draftContent: string | null;
      revision: number;
      documentGeneration: number;
      validation: ValidationResult | null;
      pendingProposal: null | {
        id: string;
        baseRevision: number;
        proposedContent: string;
      };
      history: Array<{ type: string }>;
    };
    selectAsset(assetId: string, content: string): void;
    beginAssetSelection(assetId: string): {
      assetId: string;
      operationId: number;
    };
    completeAssetSelection(
      context: { assetId: string; operationId: number },
      content: string,
    ): void;
    cancelAssetSelection(context: {
      assetId: string;
      operationId: number;
    }): boolean;
    startValidation(): {
      assetId: string;
      revision: number;
      documentGeneration: number;
      operationId: number;
    };
    cancelValidation(context: {
      assetId: string;
      revision: number;
      documentGeneration: number;
      operationId: number;
    }): boolean;
    recordValidation(
      result: ValidationResult,
      context: {
        assetId: string;
        revision: number;
        documentGeneration: number;
        operationId: number;
      },
    ): void;
    stageProposal(input: {
      summary: string;
      replacements: Array<{
        search: string;
        replacement: string;
        reason: string;
      }>;
    }): { id: string; proposedContent: string };
    approveProposal(proposalId: string): void;
    rejectProposal(proposalId: string): void;
  };
};

async function loadStore(): Promise<StoreModule | null> {
  return import("./store").catch(() => null) as Promise<StoreModule | null>;
}

describe("workspace store", () => {
  test("keeps original immutable until a human approves a proposal", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    let id = 0;
    const store = module.createWorkspaceStore({
      now: () => "2026-08-30T18:00:00.000Z",
      createId: () => `event-${++id}`,
      canStageReplacements: () => true,
    });
    store.selectAsset("cirfmf-template-base", "<NIP>#nip#</NIP>");
    const proposal = store.stageProposal({
      summary: "Replace the official template placeholder",
      replacements: [
        { search: "#nip#", replacement: "1111111111", reason: "Valid NIP" },
      ],
    });

    expect(store.getState().originalContent).toBe("<NIP>#nip#</NIP>");
    expect(store.getState().draftContent).toBe("<NIP>#nip#</NIP>");
    expect(store.getState().pendingProposal?.proposedContent).toBe(
      "<NIP>1111111111</NIP>",
    );

    store.approveProposal(proposal.id);

    expect(store.getState().originalContent).toBe("<NIP>#nip#</NIP>");
    expect(store.getState().draftContent).toBe("<NIP>1111111111</NIP>");
    expect(store.getState().revision).toBe(1);
    expect(store.getState().pendingProposal).toBeNull();
    expect(store.getState().history.map((entry) => entry.type)).toEqual([
      "asset-selected",
      "proposal-staged",
      "proposal-approved",
    ]);
  });

  test("fails closed when the selected asset is not mutation-eligible", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: (assetId) => assetId === "mutable-fa3",
    });
    store.selectAsset("crd-fa3-schema", "<schema>#value#</schema>");

    expect(() =>
      store.stageProposal({
        summary: "Attempt schema mutation",
        replacements: [
          { search: "#value#", replacement: "changed", reason: "Attempt" },
        ],
      }),
    ).toThrow("Selected asset does not allow replacement proposals");
    expect(store.getState().pendingProposal).toBeNull();
  });

  test("rejects a validation result after an A to B to A selection cycle", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore();
    store.selectAsset("asset-a", "<A/>");
    const staleContext = store.startValidation();
    store.selectAsset("asset-b", "<B/>");
    store.selectAsset("asset-a", "<A/>");

    expect(() =>
      store.recordValidation(
        { valid: true, findings: [], rawOutput: "" },
        staleContext,
      ),
    ).toThrow("Validation result is stale");
    expect(store.getState().selectedAssetId).toBe("asset-a");
    expect(store.getState().validation).toBeNull();
  });

  test("accepts only the latest concurrent validation operation", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore();
    store.selectAsset("asset-a", "<A/>");
    const older = store.startValidation();
    const newer = store.startValidation();

    expect(() =>
      store.recordValidation(
        { valid: false, findings: [], rawOutput: "older" },
        older,
      ),
    ).toThrow("Validation result is stale");
    store.recordValidation(
      { valid: true, findings: [], rawOutput: "newer" },
      newer,
    );
    expect(store.getState().validation?.rawOutput).toBe("newer");
  });

  test("rejects an out-of-order asynchronous asset selection", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore();
    const older = store.beginAssetSelection("asset-a");
    const newer = store.beginAssetSelection("asset-b");

    expect(() => store.completeAssetSelection(older, "<A/>")).toThrow(
      "Asset selection is stale",
    );
    store.completeAssetSelection(newer, "<B/>");
    expect(store.getState().selectedAssetId).toBe("asset-b");
  });

  test("refuses wrong proposal IDs and requires rejection before restaging", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    store.selectAsset("fixture", "#value#");
    const proposal = store.stageProposal({
      summary: "First",
      replacements: [
        { search: "#value#", replacement: "one", reason: "First" },
      ],
    });

    expect(() => store.approveProposal("wrong-id")).toThrow(
      "Proposal is missing or stale",
    );
    expect(() =>
      store.stageProposal({
        summary: "Second",
        replacements: [
          { search: "#value#", replacement: "two", reason: "Second" },
        ],
      }),
    ).toThrow("Resolve the pending proposal first");

    store.rejectProposal(proposal.id);
    expect(store.getState().draftContent).toBe("#value#");
    expect(store.getState().pendingProposal).toBeNull();
  });
});
