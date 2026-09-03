# PrzedWysylka Final Winning Pass — Design

**Date:** 2026-09-02
**Status:** Approved by the operator (`A` — full lean hardening pass)
**Baseline:** `7569872ff4efb99e3c6920f8891017fb66dbe9ae`

## Goal

Close the material WebMCP contract, evidence, and judge-path gaps found by the second main-thread winning-pass audit without adding tools, a backend, uploads, accounts, telemetry, KSeF submission, or release side effects.

## Frozen constraints

- Keep exactly six imperative, top-level WebMCP tools.
- Keep official validation and all document state browser-local.
- Preserve the 55-record byte-locked corpus and canonical four-file CRD closure.
- Approval, rejection, and download remain absent from the WebMCP capability surface.
- Do not claim that the application can identify a physical human from a browser-generated UI event.
- Do not publish, deploy, change repository visibility, upload a video, or submit to Devpost.
- Work only in the main conversation thread; no subagents.

## 1. Hard output budgets

Every successful WebMCP text payload must serialize to at most 1,500 characters, matching current Chrome security guidance. The existing list and source tools retain their current limits. Validation and status gain content-aware fitting rather than count-only truncation.

`validate_workspace` returns full `findingCount` and up to five compact findings. Each exported finding contains a bounded filename, line, bounded message, and an explicit `messageTruncated` flag; raw libxml output remains in browser state but is not duplicated into agent context. The payload reports whether findings or finding text were truncated and is rejected internally if the final serialized payload exceeds 1,500 characters.

`get_workspace_status` keeps summary-first state, hashes, proposal proof, totals, and the newest useful history entries. Agent-controlled proposal/history text is explicitly truncated; history count is reduced only when needed, with `historyHasMore` and text-truncation metadata. A hard postcondition rejects any oversized payload.

Runtime Zod limits remain authoritative. The published JSON Schema also documents existing maximum lengths for summary, search, replacement, and reason so an agent can self-correct before invoking the tool.

## 2. Cancellation-safe tools

The WebMCP asset loader accepts an optional execution signal. `read_official_asset` and `select_official_asset` pass the browser signal into the same locked loader used by the UI and recheck it after asynchronous loading. A cancelled selection cancels its pending context and cannot commit a new asset even when a dependency ignores the signal and resolves later. Native callers that omit callback options retain the current local fallback signal.

## 3. Byte-faithful source continuation

Source windows are sliced from offsets in the original decoded asset text, not reconstructed with `join("\n")`. Line starts recognize CRLF, LF, and bare CR. Windows include original delimiters so concatenating successive bounded pages reconstructs the exact decoded source. Budget boundaries cannot split CRLF or a UTF-16 surrogate pair. Returned line/column cursors remain explicit.

## 4. Honest authority semantics

The memorable intended workflow remains **Agent proposes · Schema proves · Human approves**. Technical claims are narrowed to what the application enforces:

- no WebMCP approval/rejection/download capability exists;
- a proven proposal can be applied only through the visible UI review control;
- browser or test automation may actuate a UI control under browser policy;
- the final recording demonstrates the intended physical-human approval step.

Audit labels become `Approved in UI` and `Rejected in UI`. No code or public copy attributes an event to a human merely because it came through a button handler.

## 5. Native evidence v2

The native smoke remains harness-free and uses the production build. Its evidence adds:

- manifest SHA-256;
- source-scope SHA-256;
- deterministic production `dist` tree SHA-256;
- selected asset identity;
- observed pending-proposal status binding;
- an enforced equality from proposal-preflight hash through final approved-draft hash.

The evidence contract test hashes the committed PNG, manifest, and scope; validates exact tools, runtime/error fields, actor label, state transition, and hash equality; and requires the production-artifact digest shape. The smoke must fail before writing evidence if any relation differs.

The injected capture runner receives the same pre-attached close-promise, bounded graceful/SIGKILL escalation, and nested-finally cleanup used by the native runner.

## 6. Demo-critical UX

Measured improvements, not a redesign:

- meaningful proof/tool/status text is enlarged and muted contrast is raised;
- mobile workflow labels never clip;
- mobile actionable controls are at least 44 CSS px high;
- mobile review panels appear before the long source viewer;
- the mobile corpus viewport is shorter and selected-row positioning lands on whole rows;
- selected assets gain a non-color check mark;
- `/` becomes a real search-focus shortcut instead of decorative keyboard fiction.

The existing desktop information architecture and six-tool story stay intact. Evidence screenshots are regenerated only after all functional gates pass.

## Acceptance

- Hostile legal-input probes keep all six tool payloads at or below 1,500 characters.
- Cancelling a delayed selection leaves the selected asset and pending work unchanged.
- Paginated CRLF/LF/CR excerpts concatenate to exact source text.
- Public/current copy has no unqualified human-only actor attribution.
- Native evidence is corpus-, screenshot-, artifact-, and state-transition-bound.
- Capture and native preview processes leave no listener race or occupied port.
- Desktop/mobile Axe has no serious or critical violations; mobile workflow labels do not clip and mobile action targets meet 44 px.
- Exact Node 22.22.2 gates, upstream replay, E2E, injected capture, and native Chrome smoke pass.
- Repository remains private and no deployment/publication action occurs.
