import { diffWordsWithSpace } from "diff";

import type { PendingProposal } from "../workspace/types";

interface ProposalPanelProps {
  proposal: PendingProposal | null;
  draftContent: string | null;
  onApprove(id: string): void;
  onReject(id: string): void;
}

export function ProposalPanel({
  proposal,
  draftContent,
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
        Approval creates revision {proposal.baseRevision + 1} and triggers fresh
        validation.
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button button--approve"
          onClick={() => onApprove(proposal.id)}
        >
          Approve changes
        </button>
        <button
          type="button"
          className="button button--danger-ghost"
          onClick={() => onReject(proposal.id)}
        >
          Reject proposal
        </button>
      </div>
    </section>
  );
}
