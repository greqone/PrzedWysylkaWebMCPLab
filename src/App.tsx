import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { getAsset, listAssets, loadAssetText } from "./assets/registry";
import type { AssetRecord } from "./assets/types";
import { AgentGuide } from "./components/AgentGuide";
import { AppHeader } from "./components/AppHeader";
import { AssetLibrary } from "./components/AssetLibrary";
import { HistoryPanel } from "./components/HistoryPanel";
import { ProposalPanel } from "./components/ProposalPanel";
import { ProvenanceDrawer } from "./components/ProvenanceDrawer";
import { SourceViewer } from "./components/SourceViewer";
import { ValidationPanel } from "./components/ValidationPanel";
import type { WebMcpUiStatus } from "./components/WebMcpStatus";
import type { ValidationResult } from "./validation/types";
import {
  buildCanonicalSchemaBundle,
  validateXml,
} from "./validation/validator";
import { registerWebMcpTools } from "./webmcp/register-tools";
import { createWorkspaceStore } from "./workspace/store";
import type { WorkspaceStore } from "./workspace/types";

const DEFAULT_ASSET_ID = "cirfmf-template-base";
const assets = listAssets();

export interface AppDependencies {
  store: WorkspaceStore;
  loadAssetText(id: string): Promise<string>;
  validateCurrent(
    content: string,
    fileName: string,
    signal: AbortSignal,
  ): Promise<ValidationResult>;
  registerTools(): Promise<{
    supported: boolean;
    controller: AbortController | null;
  }>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App({ dependencies }: { dependencies?: AppDependencies }) {
  const [ownedStore] = useState(() => createWorkspaceStore());
  const store = dependencies?.store ?? ownedStore;
  const loadText = dependencies?.loadAssetText ?? loadAssetText;
  const schemaBundle = useRef<ReturnType<
    typeof buildCanonicalSchemaBundle
  > | null>(null);
  const initialLoadStarted = useRef(false);

  const state = useSyncExternalStore(
    useCallback((listener) => store.subscribe(listener), [store]),
    store.getState,
    store.getState,
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpUiStatus>("checking");

  const validateCurrent = useCallback(
    async (content: string, fileName: string, signal: AbortSignal) => {
      if (dependencies?.validateCurrent) {
        return dependencies.validateCurrent(content, fileName, signal);
      }
      schemaBundle.current ??= buildCanonicalSchemaBundle(loadText);
      return validateXml(content, fileName, {
        schemaBundle: await schemaBundle.current,
        signal,
      });
    },
    [dependencies, loadText],
  );

  const handleSelect = useCallback(
    async (assetId: string) => {
      setLoadingId(assetId);
      setError(null);
      try {
        getAsset(assetId);
        store.selectAsset(assetId, await loadText(assetId));
      } catch (selectionError) {
        setError(messageOf(selectionError));
      } finally {
        setLoadingId(null);
      }
    },
    [loadText, store],
  );

  const runValidation = useCallback(async () => {
    const current = store.getState();
    if (!current.selectedAssetId || current.draftContent === null) return;
    const asset = getAsset(current.selectedAssetId);
    if (asset.kind !== "xml" || asset.role === "related-ubl") return;

    setValidating(true);
    setError(null);
    const controller = new AbortController();
    try {
      const result = await validateCurrent(
        current.draftContent,
        `${asset.id}.xml`,
        controller.signal,
      );
      store.recordValidation(result);
    } catch (validationError) {
      setError(messageOf(validationError));
    } finally {
      setValidating(false);
    }
  }, [store, validateCurrent]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void handleSelect(DEFAULT_ASSET_ID);
  }, [handleSelect]);

  useEffect(() => {
    let active = true;
    let registeredController: AbortController | null = null;

    const registration = dependencies?.registerTools
      ? dependencies.registerTools()
      : registerWebMcpTools(store, {
          loadAssetText: loadText,
          validateCurrent,
        });

    void registration
      .then((result) => {
        registeredController = result.controller;
        if (!active) {
          result.controller?.abort();
          return;
        }
        setWebMcpStatus(result.supported ? "connected" : "unavailable");
      })
      .catch((registrationError: unknown) => {
        if (!active) return;
        setWebMcpStatus("error");
        setError(`WebMCP: ${messageOf(registrationError)}`);
      });

    return () => {
      active = false;
      registeredController?.abort();
    };
  }, [dependencies, loadText, store, validateCurrent]);

  const selectedAsset = useMemo<AssetRecord | null>(() => {
    if (!state.selectedAssetId) return null;
    return getAsset(state.selectedAssetId);
  }, [state.selectedAssetId]);

  const canStageGuidedRepair = Boolean(
    selectedAsset?.role === "cirfmf-fa3-template" &&
    state.draftContent?.includes("#nip#") &&
    state.draftContent.includes("#invoice_number#"),
  );

  const handleStageGuidedRepair = useCallback(() => {
    setError(null);
    try {
      store.stageProposal({
        summary: "Replace both official CIRFMF template placeholders",
        replacements: [
          {
            search: "#nip#",
            replacement: "1111111111",
            reason: "Use a schema-compatible ten-digit demonstration NIP",
          },
          {
            search: "#invoice_number#",
            replacement: "FV/2026/001",
            reason: "Use a deterministic demonstration invoice number",
          },
        ],
      });
    } catch (proposalError) {
      setError(messageOf(proposalError));
    }
  }, [store]);

  const handleApprove = useCallback(
    (proposalId: string) => {
      setError(null);
      try {
        store.approveProposal(proposalId);
        void runValidation();
      } catch (approvalError) {
        setError(messageOf(approvalError));
      }
    },
    [runValidation, store],
  );

  const handleReject = useCallback(
    (proposalId: string) => {
      setError(null);
      try {
        store.rejectProposal(proposalId);
      } catch (rejectionError) {
        setError(messageOf(rejectionError));
      }
    },
    [store],
  );

  const handleDownload = useCallback(() => {
    const current = store.getState();
    if (!current.selectedAssetId || current.draftContent === null) return;
    const url = URL.createObjectURL(
      new Blob([current.draftContent], {
        type: "application/xml;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${current.selectedAssetId}-revision-${current.revision}.xml`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [store]);

  const xmlCount = assets.filter((asset) => asset.kind === "xml").length;
  const xsdCount = assets.length - xmlCount;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-source">
        Skip to shared source
      </a>
      <AppHeader
        status={webMcpStatus}
        assetCount={assets.length}
        xmlCount={xmlCount}
        xsdCount={xsdCount}
      />

      <AgentGuide />

      {error ? (
        <div className="error-banner" role="alert">
          <strong>Operation failed</strong>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ) : null}

      <main className="workbench" id="workspace-source">
        <AssetLibrary
          assets={assets}
          selectedId={state.selectedAssetId}
          loadingId={loadingId}
          onSelect={(id) => void handleSelect(id)}
        />

        <SourceViewer
          asset={selectedAsset}
          content={state.draftContent}
          revision={state.revision}
          loading={loadingId !== null}
          onDownload={handleDownload}
        />

        <aside
          className="right-rail"
          aria-label="Validation and review controls"
        >
          <ValidationPanel
            asset={selectedAsset}
            result={state.validation}
            validating={validating}
            canStageGuidedRepair={canStageGuidedRepair}
            hasPendingProposal={state.pendingProposal !== null}
            onValidate={() => void runValidation()}
            onStageGuidedRepair={handleStageGuidedRepair}
          />
          <ProposalPanel
            proposal={state.pendingProposal}
            draftContent={state.draftContent}
            onApprove={handleApprove}
            onReject={handleReject}
          />
          <HistoryPanel history={state.history} />
          <ProvenanceDrawer asset={selectedAsset} />
        </aside>
      </main>

      <footer className="app-footer">
        <span>All validation runs locally in your browser.</span>
        <span>Official assets frozen 2026-08-30 · SHA-256 locked</span>
        <a
          href="https://github.com/greqone/PrzedWysylkaWebMCPLab"
          target="_blank"
          rel="noreferrer"
        >
          Source repository
        </a>
      </footer>
    </div>
  );
}
