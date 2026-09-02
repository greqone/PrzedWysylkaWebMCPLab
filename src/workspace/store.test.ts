import { describe, expect, test } from "vitest";

import type { ValidationResult } from "../validation/types";

type StoreModule = {
  createWorkspaceStore(options?: {
    now?: () => string;
    createId?: () => string;
    canStageReplacements?: (assetId: string) => boolean;
    hashContent?: (content: string) => Promise<string | null>;
  }): {
    getState(): {
      selectedAssetId: string | null;
      originalContent: string | null;
      draftContent: string | null;
      revision: number;
      documentGeneration: number;
      validation: ValidationResult | null;
      proposalValidation: null | {
        assetId: string;
        proposalId: string;
        baseRevision: number;
        documentGeneration: number;
        validatedContent: string;
        proposedSha256: string;
        result: ValidationResult;
      };
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
    startValidation(target?: "approved-draft" | "pending-proposal"): {
      target: "approved-draft" | "pending-proposal";
      assetId: string;
      revision: number;
      documentGeneration: number;
      operationId: number;
      content: string;
      proposalId: string | null;
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
        target: "approved-draft" | "pending-proposal";
        assetId: string;
        revision: number;
        documentGeneration: number;
        operationId: number;
        content: string;
        proposalId: string | null;
      },
    ): Promise<string>;
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

    expect(() => store.approveProposal(proposal.id)).toThrow(
      "Proposal requires a current valid preflight",
    );
    const proofContext = store.startValidation("pending-proposal");
    expect(proofContext.content).toBe("<NIP>1111111111</NIP>");
    expect(proofContext.proposalId).toBe(proposal.id);
    await store.recordValidation(
      { valid: true, findings: [], rawOutput: "valid" },
      proofContext,
    );
    expect(store.getState().proposalValidation).toMatchObject({
      assetId: "cirfmf-template-base",
      proposalId: proposal.id,
      baseRevision: 0,
      validatedContent: "<NIP>1111111111</NIP>",
      proposedSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      result: { valid: true },
    });

    store.approveProposal(proposal.id);

    expect(store.getState().originalContent).toBe("<NIP>#nip#</NIP>");
    expect(store.getState().draftContent).toBe("<NIP>1111111111</NIP>");
    expect(store.getState().revision).toBe(1);
    expect(store.getState().pendingProposal).toBeNull();
    expect(store.getState().history.map((entry) => entry.type)).toEqual([
      "asset-selected",
      "proposal-staged",
      "proposal-validation-completed",
      "proposal-approved",
    ]);
  });

  test("rejects approval when proposed bytes change after preflight", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    store.selectAsset("fixture", "<NIP>#nip#</NIP>");
    const proposal = store.stageProposal({
      summary: "Candidate",
      replacements: [
        { search: "#nip#", replacement: "1111111111", reason: "Valid NIP" },
      ],
    });
    const context = store.startValidation("pending-proposal");
    await store.recordValidation(
      { valid: true, findings: [], rawOutput: "valid" },
      context,
    );

    proposal.proposedContent = "<NIP>tampered</NIP>";

    expect(() => store.approveProposal(proposal.id)).toThrow(
      "Proposal requires a current valid preflight",
    );
    expect(store.getState().draftContent).toBe("<NIP>#nip#</NIP>");
  });

  test("derives proposal SHA-256 from the validated byte snapshot", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    let hashedContent = "";
    const expectedSha256 = "d".repeat(64);
    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
      hashContent: async (content) => {
        hashedContent = content;
        return expectedSha256;
      },
    });
    store.selectAsset("fixture", "<NIP>#nip#</NIP>");
    store.stageProposal({
      summary: "Candidate",
      replacements: [
        { search: "#nip#", replacement: "1111111111", reason: "Valid NIP" },
      ],
    });
    const context = store.startValidation("pending-proposal");

    await store.recordValidation(
      { valid: true, findings: [], rawOutput: "valid" },
      context,
    );

    expect(hashedContent).toBe(context.content);
    expect(store.getState().proposalValidation?.proposedSha256).toBe(
      expectedSha256,
    );
  });

  test("rejects a malformed digest from the hashing boundary", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
      hashContent: async () => "not-a-sha256",
    });
    store.selectAsset("fixture", "#value#");
    store.stageProposal({
      summary: "Candidate",
      replacements: [
        { search: "#value#", replacement: "ok", reason: "Candidate" },
      ],
    });
    const context = store.startValidation("pending-proposal");

    await expect(
      store.recordValidation(
        { valid: true, findings: [], rawOutput: "valid" },
        context,
      ),
    ).rejects.toThrow("Validation content hash is unavailable");
    expect(store.getState().proposalValidation).toBeNull();
  });

  test("rejects proof when workspace changes while hashing is pending", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    let resolveHash!: (value: string) => void;
    const hash = new Promise<string>((resolve) => {
      resolveHash = resolve;
    });
    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
      hashContent: async () => hash,
    });
    store.selectAsset("fixture", "#value#");
    store.stageProposal({
      summary: "Candidate",
      replacements: [
        { search: "#value#", replacement: "ok", reason: "Candidate" },
      ],
    });
    const context = store.startValidation("pending-proposal");
    const recording = store.recordValidation(
      { valid: true, findings: [], rawOutput: "valid" },
      context,
    );

    store.beginAssetSelection("other-fixture");
    resolveHash("e".repeat(64));

    await expect(recording).rejects.toThrow("Validation result is stale");
    expect(store.getState().proposalValidation).toBeNull();
  });

  test("blocks approval and invalidates validation while asset selection is pending", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    store.selectAsset("fixture", "#value#");
    const proposal = store.stageProposal({
      summary: "Candidate",
      replacements: [
        { search: "#value#", replacement: "ok", reason: "Valid candidate" },
      ],
    });
    const context = store.startValidation("pending-proposal");
    const selection = store.beginAssetSelection("other-fixture");

    await expect(
      store.recordValidation(
        { valid: true, findings: [], rawOutput: "stale" },
        context,
      ),
    ).rejects.toThrow("Validation result is stale");
    expect(() => store.approveProposal(proposal.id)).toThrow(
      "Asset selection is in progress",
    );
    expect(() => store.rejectProposal(proposal.id)).toThrow(
      "Asset selection is in progress",
    );

    expect(store.cancelAssetSelection(selection)).toBe(true);
    const freshContext = store.startValidation("pending-proposal");
    await store.recordValidation(
      { valid: true, findings: [], rawOutput: "fresh" },
      freshContext,
    );
    store.approveProposal(proposal.id);
    expect(store.getState().draftContent).toBe("ok");
  });

  test("blocks proposal staging while asset selection is pending", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    store.selectAsset("fixture", "#value#");
    store.beginAssetSelection("other-fixture");

    expect(() =>
      store.stageProposal({
        summary: "Candidate",
        replacements: [
          { search: "#value#", replacement: "ok", reason: "Candidate" },
        ],
      }),
    ).toThrow("Asset selection is in progress");
    expect(store.getState().pendingProposal).toBeNull();
  });

  test("blocks rejection while proposal validation is pending", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    store.selectAsset("fixture", "#value#");
    const proposal = store.stageProposal({
      summary: "Candidate",
      replacements: [
        { search: "#value#", replacement: "ok", reason: "Candidate" },
      ],
    });
    store.startValidation("pending-proposal");

    expect(() => store.rejectProposal(proposal.id)).toThrow(
      "Proposal validation is in progress",
    );
    expect(store.getState().pendingProposal?.id).toBe(proposal.id);
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

  test("blocks approval after an invalid proposal preflight", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    store.selectAsset("fixture", "<Faktura>#value#</Faktura>");
    const proposal = store.stageProposal({
      summary: "Invalid candidate",
      replacements: [
        { search: "#value#", replacement: "bad", reason: "Exercise proof" },
      ],
    });
    const context = store.startValidation("pending-proposal");
    await store.recordValidation(
      {
        valid: false,
        findings: [
          {
            fileName: "fixture.xml",
            line: 1,
            message: "invalid",
            raw: "invalid",
          },
        ],
        rawOutput: "invalid",
      },
      context,
    );

    expect(() => store.approveProposal(proposal.id)).toThrow(
      "Proposal requires a current valid preflight",
    );
    expect(store.getState().draftContent).toBe("<Faktura>#value#</Faktura>");
    expect(store.getState().proposalValidation?.result.valid).toBe(false);
  });

  test("accepts only the latest proposal preflight and clears proof on rejection", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    store.selectAsset("fixture", "#value#");
    const proposal = store.stageProposal({
      summary: "Candidate",
      replacements: [
        { search: "#value#", replacement: "ok", reason: "Exercise staleness" },
      ],
    });
    const older = store.startValidation("pending-proposal");
    const newer = store.startValidation("pending-proposal");

    await expect(
      store.recordValidation(
        { valid: true, findings: [], rawOutput: "older" },
        older,
      ),
    ).rejects.toThrow("Validation result is stale");
    await store.recordValidation(
      { valid: true, findings: [], rawOutput: "newer" },
      newer,
    );
    expect(store.getState().proposalValidation?.proposedSha256).toMatch(
      /^[0-9a-f]{64}$/u,
    );

    store.rejectProposal(proposal.id);
    expect(store.getState().proposalValidation).toBeNull();
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

    await expect(
      store.recordValidation(
        { valid: true, findings: [], rawOutput: "" },
        staleContext,
      ),
    ).rejects.toThrow("Validation result is stale");
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

    await expect(
      store.recordValidation(
        { valid: false, findings: [], rawOutput: "older" },
        older,
      ),
    ).rejects.toThrow("Validation result is stale");
    await store.recordValidation(
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
