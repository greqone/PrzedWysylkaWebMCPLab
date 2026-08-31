import type { AssetRecord } from "../assets/types";

interface SourceViewerProps {
  asset: AssetRecord | null;
  content: string | null;
  revision: number;
  loading: boolean;
  onDownload(): void;
}

const DISPLAY_LINE_LIMIT = 600;

export function SourceViewer({
  asset,
  content,
  revision,
  loading,
  onDownload,
}: SourceViewerProps) {
  const lines = content?.split(/\r\n|\n|\r/u) ?? [];
  const displayed = lines.slice(0, DISPLAY_LINE_LIMIT);

  return (
    <section className="panel source-panel" aria-labelledby="source-title">
      <div className="panel-heading source-heading">
        <div className="source-title-group">
          <span className="eyebrow">Shared workspace</span>
          <h2 id="source-title">{asset?.title ?? "Select an asset"}</h2>
          {asset ? (
            <span className="source-path">/{asset.localPath}</span>
          ) : null}
        </div>
        <div className="source-actions">
          <span className="revision-pill">Revision {revision}</span>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={onDownload}
            disabled={!content}
          >
            Download draft
          </button>
        </div>
      </div>

      <div className="code-toolbar" aria-label="Source metadata">
        <span>{asset?.kind.toUpperCase() ?? "—"}</span>
        <span>{lines.length.toLocaleString("en")} lines</span>
        <span>
          {content
            ? new TextEncoder().encode(content).length.toLocaleString("en")
            : 0}{" "}
          bytes
        </span>
        <span className="code-trust">Escaped text · never HTML</span>
      </div>

      <div className="code-scroller">
        {loading ? (
          <div className="source-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            Loading immutable source…
          </div>
        ) : content ? (
          <pre className="source-code" data-testid="source-code" tabIndex={0}>
            <code>
              {displayed.map((line, index) => (
                <span
                  className="code-line"
                  key={`${index}-${line.slice(0, 20)}`}
                >
                  <span className="line-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="line-content">{line || " "}</span>
                </span>
              ))}
            </code>
          </pre>
        ) : (
          <div className="source-empty">
            <div className="empty-glyph" aria-hidden="true">
              &lt;/&gt;
            </div>
            <h3>No source selected</h3>
            <p>Choose any official XML or XSD from the corpus.</p>
          </div>
        )}
      </div>

      {lines.length > DISPLAY_LINE_LIMIT ? (
        <p className="truncation-note">
          Preview capped at {DISPLAY_LINE_LIMIT} lines for rendering safety.
          Download preserves all {lines.length.toLocaleString("en")} lines.
        </p>
      ) : null}
    </section>
  );
}
