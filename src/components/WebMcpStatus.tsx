export type WebMcpUiStatus = "checking" | "connected" | "unavailable" | "error";

const labels: Record<WebMcpUiStatus, string> = {
  checking: "Checking WebMCP",
  connected: "6 WebMCP tools live",
  unavailable: "WebMCP unavailable",
  error: "WebMCP registration failed",
};

export function WebMcpStatus({ status }: { status: WebMcpUiStatus }) {
  return (
    <div
      className={`webmcp-status webmcp-status--${status}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-dot" aria-hidden="true" />
      {labels[status]}
    </div>
  );
}
