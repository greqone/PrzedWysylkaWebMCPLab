const tools = [
  "list_official_assets",
  "read_official_asset",
  "select_official_asset",
  "validate_workspace",
  "stage_exact_replacements",
  "get_workspace_status",
];

export function AgentGuide() {
  return (
    <section className="agent-guide" aria-labelledby="agent-guide-title">
      <div className="agent-guide-copy">
        <span className="agent-symbol" aria-hidden="true">
          ✦
        </span>
        <div>
          <h2 id="agent-guide-title">Ask your browser agent</h2>
          <p>
            “Open the base FA(3) template, validate it, then stage exact
            replacements for its two placeholders. Do not approve them.”
          </p>
        </div>
      </div>
      <div className="tool-chips" aria-label="Registered WebMCP tools">
        {tools.map((tool) => (
          <code key={tool}>{tool}</code>
        ))}
      </div>
    </section>
  );
}
