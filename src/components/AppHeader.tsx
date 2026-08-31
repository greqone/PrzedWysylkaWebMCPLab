import { WebMcpStatus } from "./WebMcpStatus";
import type { WebMcpUiStatus } from "./WebMcpStatus";

interface AppHeaderProps {
  status: WebMcpUiStatus;
  assetCount: number;
  xmlCount: number;
  xsdCount: number;
}

export function AppHeader({
  status,
  assetCount,
  xmlCount,
  xsdCount,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          <span>PW</span>
        </div>
        <div>
          <div className="brand-row">
            <h1>PrzedWysylka Lab</h1>
            <span className="version-pill">FA(3)</span>
          </div>
          <p>Official XML · canonical XSD · human-gated WebMCP</p>
        </div>
      </div>

      <div className="header-metrics" aria-label="Official corpus summary">
        <div className="metric">
          <strong>{assetCount}</strong>
          <span>locked assets</span>
        </div>
        <div className="metric">
          <strong>{xmlCount}</strong>
          <span>XML files</span>
        </div>
        <div className="metric">
          <strong>{xsdCount}</strong>
          <span>XSD sources</span>
        </div>
      </div>

      <div className="header-actions">
        <div className="privacy-pill">
          <span className="privacy-icon" aria-hidden="true">
            ◇
          </span>
          Browser-local
        </div>
        <WebMcpStatus status={status} />
      </div>
    </header>
  );
}
