import { applyExactReplacements } from "./replacements";
import { sha256Text } from "./sha256";
import type {
  AssetSelectionContext,
  PendingProposal,
  ValidationContext,
  ValidationTarget,
  WorkspaceEvent,
  WorkspaceEventType,
  WorkspaceListener,
  WorkspaceState,
  WorkspaceStore,
} from "./types";

export interface WorkspaceStoreOptions {
  now?: () => string;
  createId?: () => string;
  canStageReplacements?: (assetId: string) => boolean;
  hashContent?: (content: string) => Promise<string | null>;
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
  proposalValidation: null,
  history: [],
};

export function createWorkspaceStore(
  options: WorkspaceStoreOptions = {},
): WorkspaceStore {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const canStageReplacements = options.canStageReplacements ?? (() => false);
  const hashContent = options.hashContent ?? sha256Text;
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
    const sharedCurrent =
      state.pendingValidation?.operationId === context.operationId &&
      context.assetId === state.selectedAssetId &&
      context.revision === state.revision &&
      context.documentGeneration === state.documentGeneration;
    if (!sharedCurrent) return false;
    if (context.target === "approved-draft") {
      return (
        context.proposalId === null && context.content === state.draftContent
      );
    }
    return (
      context.proposalId !== null &&
      context.proposalId === state.pendingProposal?.id &&
      context.content === state.pendingProposal.proposedContent &&
      context.revision === state.pendingProposal.baseRevision
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
      proposalValidation: null,
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
      validationOperationId += 1;
      emit({
        ...state,
        pendingAssetSelection: context,
        pendingValidation: null,
      });
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
    startValidation(target: ValidationTarget = "approved-draft") {
      if (!state.selectedAssetId || state.draftContent === null) {
        throw new Error("Select an official XML asset before validation");
      }
      if (state.pendingAssetSelection) {
        throw new Error("Asset selection is in progress");
      }
      const proposal =
        target === "pending-proposal" ? state.pendingProposal : null;
      if (target === "pending-proposal" && !proposal) {
        throw new Error("Stage a proposal before validating pending changes");
      }
      const context = {
        target,
        assetId: state.selectedAssetId,
        revision: state.revision,
        documentGeneration: state.documentGeneration,
        operationId: ++validationOperationId,
        content: proposal?.proposedContent ?? state.draftContent,
        proposalId: proposal?.id ?? null,
      };
      emit({ ...state, pendingValidation: context });
      return context;
    },
    async recordValidation(result, context) {
      if (!state.selectedAssetId || state.draftContent === null) {
        throw new Error("Select an official XML asset before validation");
      }
      if (!isCurrentValidation(context)) {
        throw new Error("Validation result is stale");
      }
      const contentSha256 = await hashContent(context.content);
      if (!contentSha256 || !/^[0-9a-f]{64}$/u.test(contentSha256)) {
        throw new Error("Validation content hash is unavailable");
      }
      if (
        !state.selectedAssetId ||
        state.draftContent === null ||
        !isCurrentValidation(context)
      ) {
        throw new Error("Validation result is stale");
      }
      if (context.target === "pending-proposal") {
        const proposal = state.pendingProposal;
        if (!proposal || context.proposalId !== proposal.id) {
          throw new Error("Validation result is stale");
        }
        emit(
          withEvent(
            {
              ...state,
              pendingValidation: null,
              proposalValidation: {
                assetId: context.assetId,
                proposalId: proposal.id,
                baseRevision: proposal.baseRevision,
                documentGeneration: state.documentGeneration,
                validatedContent: context.content,
                proposedSha256: contentSha256,
                result,
              },
            },
            event(
              "proposal-validation-completed",
              result.valid
                ? `Proposal ${proposal.id} is schema-valid`
                : `Proposal ${proposal.id} has ${result.findings.length} finding(s)`,
            ),
          ),
        );
        return contentSha256;
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
      return contentSha256;
    },
    cancelValidation(context) {
      if (!isCurrentValidation(context)) return false;
      emit({ ...state, pendingValidation: null });
      return true;
    },
    stageProposal(input) {
      if (state.pendingAssetSelection) {
        throw new Error("Asset selection is in progress");
      }
      if (state.pendingProposal) {
        throw new Error("Resolve the pending proposal first");
      }
      if (state.draftContent === null) {
        throw new Error("Select an official XML asset before staging changes");
      }
      if (
        !state.selectedAssetId ||
        !canStageReplacements(state.selectedAssetId)
      ) {
        throw new Error("Selected asset does not allow replacement proposals");
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
          { ...state, pendingProposal: proposal, proposalValidation: null },
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
      if (state.pendingAssetSelection) {
        throw new Error("Asset selection is in progress");
      }
      const proof = state.proposalValidation;
      if (
        !proof ||
        proof.assetId !== state.selectedAssetId ||
        proof.proposalId !== proposal.id ||
        proof.baseRevision !== state.revision ||
        proof.documentGeneration !== state.documentGeneration ||
        proof.validatedContent !== proposal.proposedContent ||
        !proof.result.valid
      ) {
        throw new Error("Proposal requires a current valid preflight");
      }
      emit(
        withEvent(
          {
            ...state,
            draftContent: proof.validatedContent,
            revision: state.revision + 1,
            documentGeneration: state.documentGeneration + 1,
            pendingValidation: null,
            pendingProposal: null,
            validation: null,
            proposalValidation: null,
          },
          event("proposal-approved", proposal.summary),
        ),
      );
    },
    rejectProposal(proposalId) {
      const proposal = requireProposal(proposalId);
      if (state.pendingAssetSelection) {
        throw new Error("Asset selection is in progress");
      }
      if (state.pendingValidation?.target === "pending-proposal") {
        throw new Error("Proposal validation is in progress");
      }
      emit(
        withEvent(
          { ...state, pendingProposal: null, proposalValidation: null },
          event("proposal-rejected", proposal.summary),
        ),
      );
    },
  };
}
