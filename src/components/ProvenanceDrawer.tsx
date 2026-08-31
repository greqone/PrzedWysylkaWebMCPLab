import type { AssetRecord } from "../assets/types";

export function ProvenanceDrawer({ asset }: { asset: AssetRecord | null }) {
  return (
    <section
      className="panel compact-panel provenance-panel"
      aria-labelledby="provenance-title"
    >
      <div className="panel-heading compact-heading">
        <div>
          <span className="eyebrow">Byte-level evidence</span>
          <h2 id="provenance-title">Provenance</h2>
        </div>
        <span className="lock-glyph" aria-hidden="true">
          ⬡
        </span>
      </div>

      {asset ? (
        <dl className="provenance-list">
          <div>
            <dt>Role</dt>
            <dd>{asset.role}</dd>
          </div>
          <div>
            <dt>Expected</dt>
            <dd>{asset.expectedValidation}</dd>
          </div>
          <div>
            <dt>Namespace</dt>
            <dd className="mono-value">{asset.namespace ?? "none"}</dd>
          </div>
          <div>
            <dt>SHA-256</dt>
            <dd className="mono-value hash-value" title={asset.sha256}>
              {asset.sha256.slice(0, 16)}…{asset.sha256.slice(-8)}
            </dd>
          </div>
          <div>
            <dt>Upstream</dt>
            <dd>
              <a href={asset.sourceUrl} target="_blank" rel="noreferrer">
                Open first-party source
              </a>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="muted-copy">
          Select an asset to inspect its source record.
        </p>
      )}
    </section>
  );
}
