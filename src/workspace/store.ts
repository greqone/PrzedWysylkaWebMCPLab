import { applyExactReplacements } from "./replacements";
import type {
  PendingProposal,
  WorkspaceEvent,
  WorkspaceEventType,
  WorkspaceListener,
  WorkspaceState,
  WorkspaceStore,
} from "./types";

export interface WorkspaceStoreOptions {
  now?: () => string;
  createId?: () => string;
}

const initialState: WorkspaceState = {
  selectedAssetId: null,
  originalContent: null,
  draftContent: null,
  revision: 0,
  pendingProposal: null,
  validation: null,
  history: [],
};

export function createWorkspaceStore(
  options: WorkspaceStoreOptions = {},
): WorkspaceStore {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const listeners = new Set<WorkspaceListener>();
  let state: WorkspaceState = initialState;

  function emit(next: WorkspaceState): void {
    state = next;
    for (const listener of listeners) listener(state);
  }

  function event(type: WorkspaceEventType, summary: string): WorkspaceEvent {
    return { id: createId(), at: now(), type, summary };
  }

  function withEvent(
    next: Omit<WorkspaceState, "history">,
    entry: WorkspaceEvent,
  ): WorkspaceState {
    return { ...next, history: [...state.history, entry] };
  }

  function requireProposal(proposalId: string): PendingProposal {
    const proposal = state.pendingProposal;
    if (
      !proposal ||
      proposal.id !== proposalId ||
      proposal.baseRevision !== state.revision
    ) {
      throw new Error("Proposal is missing or stale");
    }
    return proposal;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectAsset(assetId, content) {
      emit({
        selectedAssetId: assetId,
        originalContent: content,
        draftContent: content,
        revision: 0,
        pendingProposal: null,
        validation: null,
        history: [event("asset-selected", `Selected ${assetId}`)],
      });
    },
    recordValidation(result) {
      if (!state.selectedAssetId || state.draftContent === null) {
        throw new Error("Select an official XML asset before validation");
      }
      emit(
        withEvent(
          { ...state, validation: result },
          event(
            "validation-completed",
            result.valid
              ? `Revision ${state.revision} is valid`
              : `Revision ${state.revision} has ${result.findings.length} finding(s)`,
          ),
        ),
      );
    },
    stageProposal(input) {
      if (state.pendingProposal) {
        throw new Error("Resolve the pending proposal first");
      }
      if (state.draftContent === null) {
        throw new Error("Select an official XML asset before staging changes");
      }
      if (!input.summary.trim())
        throw new Error("Proposal summary is required");

      const application = applyExactReplacements(
        state.draftContent,
        input.replacements,
      );
      const proposal: PendingProposal = {
        id: createId(),
        baseRevision: state.revision,
        summary: input.summary.trim(),
        replacements: application.changes,
        proposedContent: application.content,
        createdAt: now(),
      };
      emit(
        withEvent(
          { ...state, pendingProposal: proposal },
          event(
            "proposal-staged",
            `${proposal.replacements.length} replacement(s) pending human approval`,
          ),
        ),
      );
      return proposal;
    },
    approveProposal(proposalId) {
      const proposal = requireProposal(proposalId);
      emit(
        withEvent(
          {
            ...state,
            draftContent: proposal.proposedContent,
            revision: state.revision + 1,
            pendingProposal: null,
            validation: null,
          },
          event("proposal-approved", proposal.summary),
        ),
      );
    },
    rejectProposal(proposalId) {
      const proposal = requireProposal(proposalId);
      emit(
        withEvent(
          { ...state, pendingProposal: null },
          event("proposal-rejected", proposal.summary),
        ),
      );
    },
  };
}
