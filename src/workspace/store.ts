import { applyExactReplacements } from "./replacements";
import type {
  AssetSelectionContext,
  PendingProposal,
  ValidationContext,
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
  documentGeneration: 0,
  pendingAssetSelection: null,
  pendingValidation: null,
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
  let assetSelectionOperationId = 0;
  let validationOperationId = 0;

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

  function isCurrentAssetSelection(context: AssetSelectionContext): boolean {
    return (
      state.pendingAssetSelection?.assetId === context.assetId &&
      state.pendingAssetSelection.operationId === context.operationId
    );
  }

  function isCurrentValidation(context: ValidationContext): boolean {
    return (
      state.pendingValidation?.operationId === context.operationId &&
      context.assetId === state.selectedAssetId &&
      context.revision === state.revision &&
      context.documentGeneration === state.documentGeneration
    );
  }

  function commitAssetSelection(assetId: string, content: string): void {
    validationOperationId += 1;
    emit({
      selectedAssetId: assetId,
      originalContent: content,
      draftContent: content,
      revision: 0,
      documentGeneration: state.documentGeneration + 1,
      pendingAssetSelection: null,
      pendingValidation: null,
      pendingProposal: null,
      validation: null,
      history: [event("asset-selected", `Selected ${assetId}`)],
    });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectAsset(assetId, content) {
      assetSelectionOperationId += 1;
      commitAssetSelection(assetId, content);
    },
    beginAssetSelection(assetId) {
      const context = {
        assetId,
        operationId: ++assetSelectionOperationId,
      };
      emit({ ...state, pendingAssetSelection: context });
      return context;
    },
    completeAssetSelection(context, content) {
      if (!isCurrentAssetSelection(context)) {
        throw new Error("Asset selection is stale");
      }
      commitAssetSelection(context.assetId, content);
    },
    cancelAssetSelection(context) {
      if (!isCurrentAssetSelection(context)) return false;
      emit({ ...state, pendingAssetSelection: null });
      return true;
    },
    startValidation() {
      if (!state.selectedAssetId || state.draftContent === null) {
        throw new Error("Select an official XML asset before validation");
      }
      if (state.pendingAssetSelection) {
        throw new Error("Asset selection is in progress");
      }
      const context = {
        assetId: state.selectedAssetId,
        revision: state.revision,
        documentGeneration: state.documentGeneration,
        operationId: ++validationOperationId,
      };
      emit({ ...state, pendingValidation: context });
      return context;
    },
    recordValidation(result, context) {
      if (!state.selectedAssetId || state.draftContent === null) {
        throw new Error("Select an official XML asset before validation");
      }
      if (!isCurrentValidation(context)) {
        throw new Error("Validation result is stale");
      }
      emit(
        withEvent(
          { ...state, pendingValidation: null, validation: result },
          event(
            "validation-completed",
            result.valid
              ? `Revision ${state.revision} is valid`
              : `Revision ${state.revision} has ${result.findings.length} finding(s)`,
          ),
        ),
      );
    },
    cancelValidation(context) {
      if (!isCurrentValidation(context)) return false;
      emit({ ...state, pendingValidation: null });
      return true;
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
            documentGeneration: state.documentGeneration + 1,
            pendingValidation: null,
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
