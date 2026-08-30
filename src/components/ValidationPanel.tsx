import type { AssetRecord } from "../assets/types";
import type { ValidationResult } from "../validation/types";

interface ValidationPanelProps {
  asset: AssetRecord | null;
  result: ValidationResult | null;
  validating: boolean;
  canStageGuidedRepair: boolean;
  hasPendingProposal: boolean;
  onValidate(): void;
  onStageGuidedRepair(): void;
}

export function ValidationPanel({
  asset,
  result,
  validating,
  canStageGuidedRepair,
  hasPendingProposal,
  onValidate,
  onStageGuidedRepair,
}: ValidationPanelProps) {
  const status = !result
    ? "Not validated"
    : result.valid
      ? "Schema valid"
      : "Needs attention";
  const statusClass = !result ? "neutral" : result.valid ? "success" : "danger";
  const cannotValidate =
    !asset || asset.kind !== "xml" || asset.role === "related-ubl";

  return (
    <section className="panel compact-panel" aria-labelledby="validation-title">
      <div className="panel-heading compact-heading">
        <div>
          <span className="eyebrow">Canonical CRD closure</span>
          <h2 id="validation-title">Validation</h2>
        </div>
        <span className={`result-pill result-pill--${statusClass}`}>
          {status}
        </span>
      </div>

      <div className="validation-summary" aria-live="polite">
        {result ? (
          result.valid ? (
            <p>
              This revision passes the canonical FA(3) root and all three
              transitive schema dependencies.
            </p>
          ) : (
            <p>
              {result.findings.length} schema finding
              {result.findings.length === 1 ? "" : "s"} on this revision.
            </p>
          )
        ) : (
          <p>
            Run the browser-local WASM validator. No document bytes leave this
            page.
          </p>
        )}
      </div>

      {result && !result.valid ? (
        <ol className="finding-list">
          {result.findings.slice(0, 8).map((finding, index) => (
            <li key={`${finding.line}-${finding.message}-${index}`}>
              <span className="finding-location">
                {finding.line ? `L${finding.line}` : "XML"}
              </span>
              <span>{finding.message}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          onClick={onValidate}
          disabled={cannotValidate || validating}
        >
          {validating ? "Validating…" : "Validate XML"}
        </button>
        {canStageGuidedRepair ? (
          <button
            type="button"
            className="button button--ghost"
            onClick={onStageGuidedRepair}
            disabled={hasPendingProposal}
          >
            Stage guided repair
          </button>
        ) : null}
      </div>
    </section>
  );
}
