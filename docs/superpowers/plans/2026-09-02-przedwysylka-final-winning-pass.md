# PrzedWysylka Final Winning Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The operator explicitly requires inline execution; do not delegate.

**Goal:** Close the second-audit WebMCP reliability, evidence-honesty, exact-source, cancellation, cleanup, and demo-readability findings.

**Architecture:** Preserve the six-tool bridge and workspace store. Add small deterministic helpers for output fitting, exact source windows, and production artifact hashing; keep state authority and validation flow unchanged while strengthening the boundaries around them.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, Playwright 1.62, Zod 4, Python 3.11/3.12, native Chrome WebMCP.

## Global Constraints

- Baseline: `7569872ff4efb99e3c6920f8891017fb66dbe9ae`.
- Work on `feat/final-winning-pass` in the main thread only.
- Keep exactly six top-level imperative tools.
- Preserve 55 locked source records and the canonical CRD closure.
- No backend, uploads, account, telemetry, model API, KSeF call, deployment, public visibility, YouTube, or Devpost action.
- Every behavior change follows RED → GREEN → focused regression → broad gates.
- Do not commit or push without a separate operator instruction.

---

### Task 1: Honest UI authority semantics

**Files:**

- Modify: `src/components/HistoryPanel.tsx`
- Modify: `src/components/ProposalPanel.tsx`
- Modify: `src/webmcp/register-tools.ts`
- Modify: `README.md`
- Modify: `docs/submission.md`
- Modify: `docs/architecture.md`
- Modify: current design/plan and evidence wording tests

**Interfaces:**

- Produces truthful UI-only labels and documentation while retaining the intended human-review workflow.

- [x] Add a failing wording test that rejects `Approved by human`, `Rejected by human`, `only a person can approve`, and unqualified claims that an agent cannot actuate UI.
- [x] Run the focused wording and React tests; verify RED.
- [x] Replace actor attribution with `Approved in UI` / `Rejected in UI` and qualify all capability claims as WebMCP-surface or UI-gate claims.
- [x] Keep `Agent proposes · Schema proves · Human approves` as intended workflow copy and document the automation limitation after the value proposition.
- [x] Run focused tests; verify GREEN.

### Task 2: Hard 1,500-character tool outputs

**Files:**

- Create: `src/webmcp/output-budget.ts`
- Create: `src/webmcp/output-budget.test.ts`
- Modify: `src/webmcp/register-tools.ts`
- Modify: `src/webmcp/register-tools.test.ts`

**Interfaces:**

- Produces `MAX_SERIALIZED_TOOL_RESULT_CHARS`, Unicode-safe text truncation, and a hard serialized-payload assertion.
- `validate_workspace` exports compact finding summaries and explicit truncation metadata.
- `get_workspace_status` dynamically fits proposal/history text and history count.

- [x] Add failing tests reproducing the observed 24,698-character validation result and 3,402-character status result.
- [x] Add schema assertions for existing maximum input lengths.
- [x] Verify RED against current callbacks.
- [x] Implement Unicode-safe bounded text and postcondition helpers.
- [x] Remove raw diagnostic duplication from WebMCP output, fit finding messages, and report text/count truncation explicitly.
- [x] Fit pending summary and newest history entries under the hard budget with explicit `historyHasMore` and summary-truncation flags.
- [x] Enumerate worst legal inputs for all six tools and assert every serialized text result is `<= 1_500`.
- [x] Run focused tests; verify GREEN.

### Task 3: Cancellation and exact source windows

**Files:**

- Create: `src/webmcp/source-window.ts`
- Create: `src/webmcp/source-window.test.ts`
- Modify: `src/webmcp/register-tools.ts`
- Modify: `src/webmcp/register-tools.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**

- `loadAssetText(id, signal?)` accepts callback cancellation.
- `sliceSourceWindow(...)` preserves CRLF/LF/CR and returns exact cursor metadata.

- [x] Add a failing delayed-loader test: abort after selection begins, resolve later, and assert no selection commit.
- [x] Add failing CRLF/LF/CR pagination tests that concatenate all returned `source` chunks and require exact input equality.
- [x] Verify RED.
- [x] Pass execution signals into asset loads, check abort before/after awaits, and cancel pending selection on failure/abort.
- [x] Replace split/join reconstruction with offset-based exact slicing; protect CRLF and surrogate boundaries.
- [x] Preserve one-argument native callback compatibility.
- [x] Run focused bridge/source/store tests; verify GREEN.

### Task 4: Native evidence v2 and capture cleanup

**Files:**

- Create: `scripts/artifact-digest.mjs`
- Modify: `scripts/native-webmcp-smoke.mjs`
- Modify: `scripts/capture-demo.mjs`
- Modify: `tests/native-webmcp-smoke.test.ts`
- Modify: `tests/capture-demo.test.ts`
- Modify after execution: `docs/assets/native-webmcp-smoke.json`, `docs/assets/native-workbench.png`

**Interfaces:**

- Produces deterministic SHA-256 for a sorted production artifact tree.
- Native evidence schema v2 binds corpus, build, screenshot, selection, proposal status, and final draft.

- [x] Add failing evidence tests for PNG/manifest/scope hashes, exact tool/state fields, artifact digest, and proposal-to-final hash equality.
- [x] Add failing source-contract tests for pre-attached capture close promise, nested finally, bounded SIGTERM/SIGKILL waits, and no late `once(server, "exit")`.
- [x] Verify RED.
- [x] Implement deterministic `dist` digest and native runtime assertions before artifact writes.
- [x] Upgrade native evidence to schema version 2 with all bindings.
- [x] Port robust owned-preview cleanup to injected capture.
- [x] Run focused tests, real capture, native smoke, and port checks; verify GREEN.

### Task 5: Demo-critical desktop/mobile UX

**Files:**

- Modify: `src/components/AssetLibrary.tsx`
- Modify: `src/styles.css`
- Modify: `src/App.test.tsx`
- Modify: `tests/e2e/workbench.spec.ts`

**Interfaces:**

- `/` focuses corpus search outside editable controls.
- Mobile review rail precedes source, labels do not clip, and actionable controls reach 44 CSS px.

- [x] Add failing keyboard-shortcut, selected-checkmark, mobile label-clipping, order, target-size, and computed-font assertions.
- [x] Verify RED.
- [x] Implement the shortcut with editable-target/modifier guards and cleanup.
- [x] Align selected-row scrolling to full rows and show a check mark.
- [x] Raise meaningful typography/contrast; add mobile ordering, heights, and non-clipping rules.
- [x] Run React/E2E/Axe and measurement probes; verify GREEN.

### Task 6: Documentation, evidence regeneration, and final gates

**Files:**

- Modify: `README.md`, `docs/submission.md`, `docs/architecture.md`, `docs/demo-script.md`
- Regenerate: injected and native screenshots/evidence
- Modify tests only where the intentional new contract requires it

**Interfaces:**

- Public copy matches actual WebMCP/UI authority, output, cancellation, exact-source, and evidence behavior.

- [x] Update tool boundary tables, evidence limitations, native v2 fields, and UI-only approval wording.
- [x] Run `npm run capture:demo` and `npm run smoke:native`; inspect both images and verify JSON hashes.
- [x] Run exact Node 22.22.2 gates: assets, native validity, scope, upstream replay twice, unit, typecheck, lint, format, audit, build, E2E, capture, and native smoke.
- [x] Run hostile budget/cancellation/newline probes and desktop/mobile Axe/metrics against the production build.
- [x] Verify ports are free, `git diff --check` passes, no secrets/temp paths entered the diff, repo remains private, and no deployment record was created.
- [x] Present the current working-tree diff and evidence. Do not commit or push.
