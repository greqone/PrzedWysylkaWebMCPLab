import { diffWordsWithSpace } from "diff";

import type {
  PendingProposal,
  ProposalValidationProof,
} from "../workspace/types";

interface ProposalPanelProps {
  proposal: PendingProposal | null;
  proof: ProposalValidationProof | null;
  validating: boolean;
  selectionPending: boolean;
  connected: boolean;
  draftContent: string | null;
  onValidateProposal(): void;
  onApprove(id: string): void;
  onReject(id: string): void;
}

export function ProposalPanel({
  proposal,
  proof,
  validating,
  selectionPending,
  connected,
  draftContent,
  onValidateProposal,
  onApprove,
  onReject,
}: ProposalPanelProps) {
  if (!proposal || draftContent === null) {
    return (
      <section
        className="panel compact-panel proposal-empty"
        aria-labelledby="proposal-title"
      >
        <div className="panel-heading compact-heading">
          <div>
            <span className="eyebrow">Human authority</span>
            <h2 id="proposal-title">Proposal review</h2>
          </div>
          <span className="result-pill result-pill--neutral">
            No pending change
          </span>
        </div>
        <p>
          Agents may stage exact replacements. They cannot approve, download, or
          silently mutate the draft.
        </p>
      </section>
    );
  }

  const diff = diffWordsWithSpace(draftContent, proposal.proposedContent);
  const proofIsCurrent =
    proof?.proposalId === proposal.id &&
    proof.baseRevision === proposal.baseRevision &&
    proof.validatedContent === proposal.proposedContent;
  const validProof = proofIsCurrent && proof.result.valid;
  const proofLabel = validating
    ? "Validating proposed change"
    : !proofIsCurrent
      ? connected
        ? "Waiting for agent preflight"
        : "Preflight required"
      : proof.result.valid
        ? "Schema valid before approval"
        : "Proposal needs correction";

  return (
    <section
      className="panel compact-panel proposal-panel"
      aria-labelledby="proposal-title"
    >
      <div className="panel-heading compact-heading">
        <div>
          <span className="eyebrow">Uncommitted agent work</span>
          <h2 id="proposal-title">Pending human approval</h2>
        </div>
        <span className="pending-dot" aria-label="Pending" />
      </div>

      <p className="proposal-summary">{proposal.summary}</p>
      <div className="proposal-meta">
        <span>{proposal.replacements.length} exact replacements</span>
        <span>Base revision {proposal.baseRevision}</span>
      </div>

      <div
        className={`proposal-proof ${validProof ? "proposal-proof--valid" : ""}`}
        aria-live="polite"
      >
        <strong>{proofLabel}</strong>
        {proofIsCurrent ? (
          <span>
            {proof.result.findings.length} finding
            {proof.result.findings.length === 1 ? "" : "s"} · SHA-256{" "}
            <code title={proof.proposedSha256}>
              {proof.proposedSha256.slice(0, 12)}…
            </code>
          </span>
        ) : (
          <span>
            The exact pending bytes must pass canonical FA(3) validation.
          </span>
        )}
      </div>

      {!connected ? (
        <button
          type="button"
          className="button button--ghost button--preflight"
          onClick={onValidateProposal}
          disabled={validating || selectionPending}
        >
          {validating
            ? "Validating proposed change…"
            : "Validate proposed change"}
        </button>
      ) : null}

      <div className="replacement-list">
        {proposal.replacements.map((replacement) => (
          <article
            className="replacement-card"
            key={`${replacement.start}-${replacement.search}`}
          >
            <p>{replacement.reason}</p>
            <code>
              <del>{replacement.search}</del>
              <span aria-hidden="true"> → </span>
              <ins>{replacement.replacement || "∅"}</ins>
            </code>
          </article>
        ))}
      </div>

      <div
        className="proposal-diff"
        aria-label="Pending proposal diff"
        tabIndex={0}
      >
        {diff.map((part, index) => (
          <span
            className={
              part.added
                ? "diff-added"
                : part.removed
                  ? "diff-removed"
                  : undefined
            }
            key={`${index}-${part.value.slice(0, 12)}`}
          >
            {part.value}
          </span>
        ))}
      </div>

      <div className="approval-warning">
        Approval requires current schema-valid proof, creates revision{" "}
        {proposal.baseRevision + 1}, and validates the approved bytes again.
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button button--approve"
          onClick={() => onApprove(proposal.id)}
          disabled={!validProof || validating || selectionPending}
        >
          Approve changes
        </button>
        <button
          type="button"
          className="button button--danger-ghost"
          onClick={() => onReject(proposal.id)}
          disabled={selectionPending || validating}
        >
          Reject proposal
        </button>
      </div>
    </section>
  );
}
