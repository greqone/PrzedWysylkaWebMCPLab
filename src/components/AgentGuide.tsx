import type { WebMcpUiStatus } from "./WebMcpStatus";

const tools = [
  "list_official_assets",
  "read_official_asset",
  "select_official_asset",
  "validate_workspace",
  "stage_exact_replacements",
  "get_workspace_status",
];

export const AGENT_PROMPT =
  "Open the base FA(3) template, validate it, then stage exact replacements for its two placeholders. Validate the pending proposal, but do not approve it.";

export function AgentGuide({
  status,
  onCopyPrompt,
}: {
  status: WebMcpUiStatus;
  onCopyPrompt(): void;
}) {
  return (
    <section className="agent-guide" aria-labelledby="agent-guide-title">
      <div className="agent-guide-copy">
        <span className="agent-symbol" aria-hidden="true">
          ✦
        </span>
        <div>
          <h2 id="agent-guide-title">Ask your browser agent</h2>
          <p>“{AGENT_PROMPT}”</p>
          <button
            type="button"
            className="button button--ghost button--small copy-prompt"
            onClick={onCopyPrompt}
          >
            Copy prompt
          </button>
        </div>
      </div>
      <div className="agent-guide-details">
        <ol className="collaboration-steps" aria-label="Collaboration steps">
          <li>
            <span>1</span>
            <strong>Agent proposes</strong>
          </li>
          <li>
            <span>2</span>
            <strong>Schema proves</strong>
          </li>
          <li>
            <span>3</span>
            <strong>Human approves</strong>
          </li>
        </ol>
        <div className="tool-chips" aria-label="Registered WebMCP tools">
          {tools.map((tool) => (
            <code key={tool}>{tool}</code>
          ))}
        </div>
        {status === "connected" ? (
          <span className="agent-ready-copy">Native tools ready</span>
        ) : null}
      </div>
    </section>
  );
}
