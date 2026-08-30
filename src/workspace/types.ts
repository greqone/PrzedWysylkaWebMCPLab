import type { ValidationResult } from "../validation/types";
import type { AppliedReplacement, ExactReplacement } from "./replacements";

export type WorkspaceEventType =
  | "asset-selected"
  | "validation-completed"
  | "proposal-staged"
  | "proposal-approved"
  | "proposal-rejected";

export interface WorkspaceEvent {
  id: string;
  at: string;
  type: WorkspaceEventType;
  summary: string;
}

export interface PendingProposal {
  id: string;
  baseRevision: number;
  summary: string;
  replacements: AppliedReplacement[];
  proposedContent: string;
  createdAt: string;
}

export interface WorkspaceState {
  selectedAssetId: string | null;
  originalContent: string | null;
  draftContent: string | null;
  revision: number;
  pendingProposal: PendingProposal | null;
  validation: ValidationResult | null;
  history: WorkspaceEvent[];
}

export interface StageProposalInput {
  summary: string;
  replacements: ExactReplacement[];
}

export type WorkspaceListener = (state: Readonly<WorkspaceState>) => void;

export interface WorkspaceStore {
  getState(): Readonly<WorkspaceState>;
  subscribe(listener: WorkspaceListener): () => void;
  selectAsset(assetId: string, content: string): void;
  recordValidation(result: ValidationResult): void;
  stageProposal(input: StageProposalInput): PendingProposal;
  approveProposal(proposalId: string): void;
  rejectProposal(proposalId: string): void;
}
