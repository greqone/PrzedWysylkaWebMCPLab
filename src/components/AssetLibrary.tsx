import { useEffect, useMemo, useRef, useState } from "react";

import type { AssetKind, AssetRecord } from "../assets/types";

interface AssetLibraryProps {
  assets: AssetRecord[];
  selectedId: string | null;
  loadingId: string | null;
  onSelect(id: string): void;
}

const roleLabels: Record<string, string> = {
  "mf-valid-example": "MF example",
  "cirfmf-fa3-template": "CIRFMF template",
  "related-ubl": "Related UBL",
  "canonical-xsd-root": "CRD root",
  "canonical-xsd-dependency": "CRD dependency",
  "cirfmf-xsd-source": "CIRFMF XSD",
};

function formatBytes(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`;
}

export function AssetLibrary({
  assets,
  selectedId,
  loadingId,
  onSelect,
}: AssetLibraryProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const selectedElement = useRef<HTMLButtonElement | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en");
    return assets.filter((asset) => {
      if (kind !== "all" && asset.kind !== kind) return false;
      if (!needle) return true;
      return `${asset.title} ${asset.id} ${asset.role}`
        .toLocaleLowerCase("en")
        .includes(needle);
    });
  }, [assets, kind, query]);

  useEffect(() => {
    const element = selectedElement.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    const itemTop = element.offsetTop - container.offsetTop;
    container.scrollTop = Math.max(
      0,
      itemTop - (container.clientHeight - element.offsetHeight) / 2,
    );
  }, [selectedId]);

  return (
    <aside
      className="panel asset-library"
      aria-labelledby="asset-library-title"
    >
      <div className="panel-heading asset-heading">
        <div>
          <span className="eyebrow">First-party corpus</span>
          <h2 id="asset-library-title">Official assets</h2>
        </div>
        <span className="count-badge">{filtered.length}</span>
      </div>

      <label className="search-field">
        <span className="visually-hidden">Search official assets</span>
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search corpus"
        />
        <kbd>/</kbd>
      </label>

      <div className="filter-tabs" aria-label="Filter assets by type">
        {(["all", "xml", "xsd"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={kind === value ? "filter-tab is-active" : "filter-tab"}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {value === "all" ? "All" : value.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="asset-list" aria-live="polite">
        {filtered.map((asset) => {
          const selected = asset.id === selectedId;
          const loading = asset.id === loadingId;
          return (
            <button
              key={asset.id}
              type="button"
              className={`asset-item${selected ? " is-selected" : ""}`}
              ref={(element) => {
                if (selected) selectedElement.current = element;
              }}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(asset.id)}
              disabled={loading}
            >
              <span className={`file-icon file-icon--${asset.kind}`}>
                {asset.kind.toUpperCase()}
              </span>
              <span className="asset-copy">
                <strong>{asset.title}</strong>
                <span>
                  {roleLabels[asset.role] ?? asset.role} ·{" "}
                  {formatBytes(asset.bytes)}
                </span>
              </span>
              <span className="asset-chevron" aria-hidden="true">
                {loading ? "···" : "›"}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="empty-list">No official assets match this filter.</p>
        ) : null}
      </div>
    </aside>
  );
}
