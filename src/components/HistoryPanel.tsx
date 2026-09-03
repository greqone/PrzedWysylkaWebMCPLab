import type { WorkspaceEvent } from "../workspace/types";

const eventLabels: Record<WorkspaceEvent["type"], string> = {
  "asset-selected": "Selected",
  "validation-completed": "Validated",
  "proposal-staged": "Staged",
  "proposal-validation-completed": "Proposal preflight",
  "proposal-approved": "Approved in UI",
  "proposal-rejected": "Rejected in UI",
};

export function HistoryPanel({ history }: { history: WorkspaceEvent[] }) {
  return (
    <section className="panel compact-panel" aria-labelledby="history-title">
      <div className="panel-heading compact-heading">
        <div>
          <span className="eyebrow">Visible by design</span>
          <h2 id="history-title">Audit trail</h2>
        </div>
        <span className="count-badge">{history.length}</span>
      </div>

      {history.length ? (
        <ol className="history-list">
          {[...history]
            .reverse()
            .slice(0, 8)
            .map((entry) => (
              <li key={entry.id}>
                <span
                  className={`history-marker history-marker--${entry.type}`}
                  aria-hidden="true"
                />
                <div>
                  <strong>{eventLabels[entry.type]}</strong>
                  <p>{entry.summary}</p>
                  <time dateTime={entry.at}>
                    {new Intl.DateTimeFormat("en", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }).format(new Date(entry.at))}
                  </time>
                </div>
              </li>
            ))}
        </ol>
      ) : (
        <p className="muted-copy">Workspace actions will appear here.</p>
      )}
    </section>
  );
}
