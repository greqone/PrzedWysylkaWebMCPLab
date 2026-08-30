# PrzedWysylka WebMCP Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-subagent-driven-development (recommended) or superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a polished browser-local FA(3) workbench exposing a real human-in-the-loop workflow through native WebMCP tools.

**Architecture:** A static Vite/React SPA loads a hash-locked first-party corpus, validates XML in-browser with `xmllint-wasm`, stores immutable originals plus approved/pending revisions, and exposes the same state through `document.modelContext.registerTool()`. Agent changes are proposals; only UI actions approve or reject them.

**Tech Stack:** Node 22.22.2; Vite 8.2.2; React 19.2.8; TypeScript 7.0.2; xmllint-wasm 5.3.0; webmcp-types 0.1.5; Zod 4.5.4; Vitest 4.1.11; Playwright 1.62.1.

## Global Constraints

- Include all 26 MF example XMLs, three CIRFMF FA(3) templates, one separately labelled UBL fixture, four canonical CRD XSDs, and two CIRFMF XSD source records.
- Canonical validation uses only the four-file CRD closure.
- Preserve source bytes and verify SHA-256 before build.
- No private PrzedWysylka code, backend, upload, KSeF API, analytics, secrets, or agent-callable approval.
- Feature-detect `document.modelContext`; no production WebMCP polyfill.
- All user-facing and submission copy is English.

---

### Task 1: Reproducible scaffold and official corpus

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `.nvmrc`
- Create: `data/official-assets.lock.json`, `scripts/verify-official-assets.mjs`
- Create: `public/official-assets/**`, `src/assets/types.ts`, `src/assets/registry.ts`
- Test: `src/assets/registry.test.ts`, `tests/assets-lock.test.ts`

**Interfaces:**
- Produces `AssetRecord`, `AssetManifest`, `listAssets(filter)`, `getAsset(id)`, and `loadAssetText(id, signal?)`.

- [ ] Copy every frozen first-party asset under stable ASCII paths and generate the lock with source URL/path, role, expected validation class, SHA-256, and bytes.
- [ ] Write failing tests asserting exact class counts, unique IDs, canonical closure membership, and content hashes.
- [ ] Implement registry and hash verifier; run `npm run verify:assets` and the focused tests until green.
- [ ] Commit only scaffold, corpus, registry, and tests.

### Task 2: Browser-local validator and normalized findings

**Files:**
- Create: `src/validation/types.ts`, `src/validation/validator.ts`, `src/validation/normalize.ts`
- Test: `src/validation/normalize.test.ts`, `tests/corpus-validation.test.ts`

**Interfaces:**
- Consumes `loadAssetText()` and canonical schema IDs.
- Produces `validateXml(xml, fileName, signal?): Promise<ValidationResult>` where transport/schema failures throw and invalid documents resolve with `valid: false` plus findings.

- [ ] Write failing normalization and corpus contract tests.
- [ ] Wrap `xmllint-wasm` 5.3.0 using the CRD root as `schema[0]` and the three dependencies as `preload` records.
- [ ] Prove all 26 MF examples valid and classify each CIRFMF template by expected-invalid reason.
- [ ] Run focused tests and commit validator code separately.

### Task 3: Workspace state and six WebMCP tools

**Files:**
- Create: `src/workspace/types.ts`, `src/workspace/store.ts`, `src/workspace/replacements.ts`
- Create: `src/webmcp/tool-result.ts`, `src/webmcp/register-tools.ts`
- Test: `src/workspace/store.test.ts`, `src/workspace/replacements.test.ts`, `src/webmcp/register-tools.test.ts`

**Interfaces:**
- Produces `createWorkspaceStore()`, `WorkspaceStore.subscribe/getState`, `stageProposal`, `approveProposal`, `rejectProposal`, and `registerWebMcpTools(store): AbortController`.

- [ ] Write failing tests for atomic exact replacement, duplicate/overlap rejection, stale-base approval refusal, and immutable originals.
- [ ] Implement store/history and proposal transitions.
- [ ] Register `list_official_assets`, `read_official_asset`, `select_official_asset`, `validate_workspace`, `stage_exact_replacements`, and `get_workspace_status` with Zod-validated inputs.
- [ ] Prove no tool can approve/download and abort unregisters every tool; run tests and commit.

### Task 4: Complete React workbench

**Files:**
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles.css`
- Create: `src/components/AppHeader.tsx`, `AssetLibrary.tsx`, `SourceViewer.tsx`, `ValidationPanel.tsx`, `ProposalPanel.tsx`, `HistoryPanel.tsx`, `ProvenanceDrawer.tsx`, `WebMcpStatus.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes the registry, validator, workspace store, and WebMCP bridge without duplicating domain logic.

- [ ] Write a failing interaction test for select → validate → stage → approve/reject.
- [ ] Implement a responsive three-pane workbench with keyboard-accessible controls, visible WebMCP support state, loading/error boundaries, source line numbers, findings, proposal diff, history, provenance, and approved-draft download.
- [ ] Add an honest unsupported-browser message while preserving all human UI functionality.
- [ ] Run unit tests, typecheck, lint, and build; commit the complete product UI.

### Task 5: End-to-end proof and submission package

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/workbench.spec.ts`, `tests/e2e/webmcp-harness.ts`
- Create: `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/architecture.md`, `docs/submission.md`, `docs/demo-script.md`
- Create: `.github/workflows/ci.yml`, `netlify.toml`

**Interfaces:**
- Produces a static `dist/` artifact and reproducible judge instructions.

- [ ] Inject a standards-shaped `document.modelContext` harness before page load and execute the real registered tools through it.
- [ ] Test discover → select official template → validate → stage exact replacement → verify source unchanged → click human approval → revalidate/status.
- [ ] Add accessibility assertions and an unsupported-WebMCP smoke path.
- [ ] Run `npm run verify:assets && npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`.
- [ ] Inspect the built artifact for source maps, secrets, private paths, and missing assets; commit the verified submission package.
