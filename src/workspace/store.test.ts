import { describe, expect, test } from "vitest";

type StoreModule = {
  createWorkspaceStore(options?: {
    now?: () => string;
    createId?: () => string;
  }): {
    getState(): {
      selectedAssetId: string | null;
      originalContent: string | null;
      draftContent: string | null;
      revision: number;
      pendingProposal: null | {
        id: string;
        baseRevision: number;
        proposedContent: string;
      };
      history: Array<{ type: string }>;
    };
    selectAsset(assetId: string, content: string): void;
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

  test("refuses wrong proposal IDs and requires rejection before restaging", async () => {
    const module = await loadStore();
    expect(module, "workspace store module must exist").not.toBeNull();
    if (!module) return;

    const store = module.createWorkspaceStore();
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
