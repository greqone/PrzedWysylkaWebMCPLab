# PrzedWysylka WebMCP Competition Winning Pass — Design

**Date:** 2026-08-31
**Status:** Approved by the operator (`napraw wszystko`)
**Repository baseline:** `566b7e89edeb68e4852a4bc9a788eb2ddb0813c0`

## Goal

Turn the merged FA(3) workbench from a harness-verified implementation into a natively verified, judge-readable WebMCP collaboration product. The winning pass fixes the observed native callback incompatibility, makes pending changes carry schema proof before approval, bounds tool outputs for agent reliability, and sharpens the app, README, submission copy, and demo around one memorable sequence:

> **Agent proposes. Schema proves. Human approves.**

The work does not add customer XML upload, a backend, accounts, KSeF submission, telemetry, or more WebMCP tools.

## Constraints

- Keep exactly six imperative, top-level WebMCP tools.
- Keep approval, rejection, and download human-only.
- Keep every official source asset immutable and preserve the 55-record frozen corpus.
- Preserve the ordinary-browser human UI and manual demo fallback.
- Keep validation browser-local and use the canonical four-file CRD closure.
- Do not publish the repository, deploy, or submit to Devpost as part of implementation.
- Do not commit or push without a separate operator instruction.

## 1. Native execution compatibility

Chrome 152 with `--enable-features=WebMCPTesting` exposes native `document.modelContext`, registers all six production tools, and invokes tool callbacks with one argument. The current `validate_workspace(input, { signal })` destructures an absent second argument and fails with `TypeError`.

`validate_workspace` must treat callback options as optional. If the browser does not provide an `AbortSignal`, the callback creates a local controller and passes its signal to the validator. A focused regression invokes the registered callback with one argument.

The production native smoke must use Chrome's real `document.modelContext.getTools()` and `executeTool()` APIs. It must not inject or polyfill a model context.

## 2. Proof-carrying proposals

A pending proposal receives a separate schema-validation proof before approval. The proof is bound to:

- proposal ID;
- selected asset ID;
- base revision;
- document generation;
- exact proposed content;
- SHA-256 of the proposed content.

The workspace store owns validation contexts for two targets:

- `approved-draft` — the current human-approved revision;
- `pending-proposal` — the exact staged content.

A pending-proposal validation result is accepted only when the context still matches the current proposal and document generation. Selecting another asset, rejecting the proposal, staging another proposal, or approving it invalidates the proof. Out-of-order validations fail closed.

Approval requires a current proof with `valid: true`. A missing, stale, or invalid proof produces a descriptive error. After approval, the app validates the new approved revision again.

The `validate_workspace` tool gains an optional `target` enum and defaults to `approved-draft`. It remains one validation function rather than adding a seventh tool. `get_workspace_status` reports the proof metadata and proposed SHA-256.

The proposal panel shows:

- waiting-for-preflight state;
- validating state;
- valid or invalid proof status;
- finding count and a short proposed SHA-256;
- approval disabled until the current proof is valid.

In a WebMCP-connected browser, the agent performs proposal preflight. In the ordinary-browser fallback, the human receives an explicit manual preflight button.

## 3. Bounded WebMCP outputs

Tool output should be sufficient for the next action without dumping the entire corpus into agent context.

### `list_official_assets`

Inputs:

- existing `kind`, `role`, and `search` filters;
- `offset`, integer, default `0`, minimum `0`;
- `limit`, integer, default `6`, range `1..6`.

Output:

- `total` filtered records;
- `returned` records in this page;
- `offset`, `limit`, `hasMore`, `nextOffset`;
- compact asset entries containing ID, title, kind, role, and expected validation class.

No truncation is silent. The full 55-record set remains reachable through explicit pages or filters.

### `read_official_asset`

- default `lineCount` becomes `20`;
- maximum becomes `30`;
- output includes `truncated` and `nextLine`.

### Validation and status

- validation returns at most five findings plus `findingCount`, `returnedFindings`, and `truncated`;
- workspace status returns at most eight history entries and declares the number returned;
- tests measure serialized outputs for the competition demo path and keep them near the official 1.5K-character guidance.

## 4. Judge-facing product experience

### Connected and fallback behavior

The existing `Stage guided repair` button undermines WebMCP leverage when native tools are connected. It becomes an explicitly named `Manual demo fallback` shown only when WebMCP is unavailable or registration failed. Connected mode requires the agent to stage the proposal.

Manual fallback remains complete: stage, manually preflight, approve or reject.

### Agent guide

The guide presents three compact steps:

1. **Agent proposes** — structured tools inspect and stage exact edits.
2. **Schema proves** — canonical XSD preflights the pending content.
3. **Human approves** — only the visible UI can apply the proven proposal.

It retains the exact prompt and adds a `Copy prompt` control. The header uses the same three-part message.

### Browser polish

- Add a local SVG favicon so native Chrome produces no `/favicon.ico` error.
- Add `Origin-Agent-Cluster: ?1` to deployment headers.
- Preserve CSP, `tools=(self)`, COOP, CORP, and no-network application behavior.

## 5. Native evidence

Add an optional `npm run smoke:native` command that:

1. uses the production build and a locally owned preview server;
2. discovers a system Chrome executable or accepts `WEBMCP_CHROME_PATH`;
3. launches Chrome with `--enable-features=WebMCPTesting`;
4. verifies native `document.modelContext` and exactly six tools;
5. executes list, select, approved-draft validation, bounded read, stage, and pending-proposal validation through native `executeTool()`;
6. proves there is no agent approval/apply/download tool;
7. uses Playwright to click the visible human-only approval button;
8. verifies revision `1`, no pending proposal, and a valid approved draft;
9. fails on console, page, HTTP, or request errors;
10. writes deterministic evidence JSON and a pre-approval screenshot under `docs/assets/`.

The existing injected-harness E2E remains as the deterministic cross-platform adapter regression. Documentation distinguishes the two evidence classes.

## 6. Submission and repository presentation

README first fold becomes product-first:

- value proposition;
- native screenshot and an honest publication-gate statement until a real live URL exists;
- 30-second judge path;
- before/after WebMCP comparison;
- exact test prompt.

Harness caveats move to the verification section. Corpus census details remain available but no longer dominate the first screen.

Testing instructions explicitly say:

- update ChatGPT Desktop;
- use GPT-5.6 Sol or GPT-5.6 Terra;
- GPT-5.6 Luna currently has WebMCP disabled;
- inspect `Site tools` and expect six tools;
- alternatively use Chrome 149+ with `chrome://flags/#enable-webmcp-testing`.

Submission and video copy emphasize the proof-carrying collaboration sequence. The native smoke's automated UI click is reported as automation; the final recording separately shows the visible human approval click.

GitHub repository topics may be added while private. Homepage and license visibility are verified only after the separately approved deployment/publication step because no live URL exists yet.

## Failure behavior

- Missing callback options never breaks validation.
- A pending proposal without valid current proof cannot be approved.
- Invalid proposal preflight leaves the approved draft unchanged.
- Stale validation results cannot attach to a new or changed proposal.
- Tool pagination is explicit and deterministic.
- Native smoke exits non-zero if the browser lacks WebMCP or any expected behavior differs.
- Unsupported browsers retain a functioning manual path and never receive a fake model context.

## Verification

Required focused gates:

- workspace store proposal-proof tests;
- WebMCP callback, target, pagination, and budget tests;
- React connected/fallback/proposal-proof tests;
- updated harness E2E;
- native production WebMCP smoke without a harness.

Required broad gates:

- `npm run verify:assets`;
- `npm run verify:native` where `xmllint` is available;
- `npm test`;
- `npm run typecheck`;
- `npm run lint`;
- `npm run format:check`;
- `npm audit --audit-level=high`;
- `npm run build`;
- `npm run test:e2e`;
- `npm run smoke:native`.
