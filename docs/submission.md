# Devpost submission draft

## Project name

PrzedWysylka WebMCP Lab

## Tagline

A browser-local FA(3) workbench where an agent can prove a repair while approval remains a visible UI decision.

## Submission status

- Source repository: https://github.com/greqone/PrzedWysylkaWebMCPLab (currently private; it must be public before submission)
- Public deployment URL: not assigned until operator-approved publication
- YouTube demo URL: not assigned until the final recording is reviewed and published

No URL is fabricated in this draft. The product, production build, native-browser evidence, and recording runbook exist independently of those publication gates. This draft is not submission-ready until the live URL, public repository, and public video are real.

## What it does

PrzedWysylka WebMCP Lab is a browser-local workbench for Poland's official FA(3) structured invoice XML. A person and a browser agent share one visible source, canonical validator, pending diff, and audit trail.

The demo starts with an official parameterized template at Revision 0. It is intentionally invalid. The agent uses six narrow WebMCP tools to find the source, validate the approved draft, stage two exact replacements, and validate the pending proposal. The UI then shows a schema-valid SHA-256 proof bound to the proposal and its base revision.

The agent stops there. No approval tool exists. The visible UI review control creates Revision 1, clears the proposal, and runs canonical validation again. In the intended workflow and final recording, the person performs that action. Revision 1 validates again before the workflow is complete.

## The problem and audience

Regulatory XML puts dense source, strict schemas, and consequential edits in one place. Accountants, developers, QA teams, and compliance operators often need help finding a bad value or preparing a correction, but the person responsible for the document still needs to see and authorize the exact bytes.

Visual browser automation is a poor fit for this work. It has to infer the selected file, scrape diagnostics, scroll code, and type into an editor. A remote MCP server would bypass the page and create a second state model. This app keeps the page as the shared review surface: the agent handles the mechanical steps while the person retains final authority.

## Why this is a strong fit for WebMCP

WebMCP exposes the capabilities the page already owns: locked sources, current selection, canonical validation, proposal staging, and revision state. The agent receives structured actions and bounded results. The person sees every state change in the same interface.

The important design choice is omission. Approval, rejection, download, upload, and submission are not WebMCP capabilities. The agent-facing contract does not depend on a prompt asking the model to behave; the final decision remains visible in the page UI.

## What becomes better

Before WebMCP, an agent would need to inspect DOM text, guess which schema and revision are active, and type into an editor. With WebMCP it can:

1. discover all 55 first-party records;
2. select the official parameterized template;
3. run the canonical validator;
4. read only the relevant lines;
5. stage two exact replacements;
6. validate the exact pending bytes and return their SHA-256;
7. stop at a visible UI approval gate.

The human sees the same selected file, finding, proposal, and audit trail throughout the flow.

## How WebMCP is implemented

The app feature-detects `document.modelContext` and registers six imperative tools with `document.modelContext.registerTool()`. Tool definitions use static descriptions, JSON input schemas, read-only/untrusted-content annotations where applicable, Zod validation inside callbacks, and one AbortController for lifecycle cleanup.

All callbacks reuse the asset registry, validator, replacement engine, and workspace store used by the visible UI. Every successful tool text payload is capped at 1,500 serialized characters. Lists return at most six records per page. Source windows preserve original CRLF, LF, and CR delimiters and expose a line and UTF-16-code-unit column cursor. Validation returns the full finding count plus up to five compact summaries with explicit filename/message truncation flags; status dynamically fits up to eight newest events and reports omitted history and truncated summaries. The browser's `AbortSignal` reaches asset fetches, and a cancelled selection cannot commit after cancellation even when a dependency resolves later.

`validate_workspace` accepts either the current approved draft or the pending proposal. The store derives SHA-256 from the validated-content snapshot, rechecks state after the asynchronous digest, and records the asset ID, `proposalId`, `baseRevision`, document generation, result, and `proposedSha256`. Approval fails closed unless that proof is current, valid, and bound to the same bytes. Unsupported browsers receive no polyfill and display an honest compatibility state.

## Privacy and integrity

- Static site; no application backend.
- Validation runs through libxml2 compiled to WebAssembly.
- No uploads, accounts, cookies, analytics, or KSeF API calls.
- All 55 official records are SHA-256 and byte-count locked.
- Original sources remain immutable.
- Exact replacements must be unique and non-overlapping.
- Approval is absent from WebMCP, remains a visible UI decision, and stale proposals fail closed.
- XML is rendered as escaped text and marked untrusted when returned through WebMCP.

## Built with

- WebMCP draft API (`document.modelContext.registerTool`)
- React 19 + TypeScript 6 + Vite 8
- `xmllint-wasm` / libxml2
- Zod
- Vitest + Playwright + Axe
- Static Netlify-compatible deployment

## Verification evidence

The strongest artifact is a proof-bound native Chrome smoke against the production build. Evidence schema version 2 records the exact Node and Chrome versions, a deterministic production artifact digest, corpus manifest and source-scope hashes, and the screenshot hash. It uses Chrome's real `document.modelContext`, registers exactly six tools, executes all six callbacks, confirms there is no WebMCP approval tool, and proves equality from proposal preflight through pending status and store-owned proof to the final applied draft. It performs an automated Playwright click through the UI-only review control and waits until Revision 1 validates again. This proves that the UI gate is enforced and traversable; it does not claim that a person approved the automated smoke. The JSON reports `nativeModelContext: true`, `injectedHarness: false`, and no runtime errors. See [`native-webmcp-smoke.json`](assets/native-webmcp-smoke.json) and the bound [`native-workbench.png`](assets/native-workbench.png).

The deterministic Playwright E2E suite separately uses a standards-shaped injected WebMCP harness. It covers registration, shared state, proposal gating, the UI approval path, ordinary-browser fallback, and Axe. The injected harness does not prove browser-native WebMCP API, permission, or agent compatibility; the native smoke covers the browser callback boundary, while the final ChatGPT recording must still demonstrate model-driven tool choice.

The data evidence is deliberately separate:

- all 55 locked source records, byte hashes, and duplicate relationships are checked offline;
- an independent default-tree census partitions all 39 XML and 31 XSD paths from six pinned repositories and discovers exactly 18 FA(3) XML and 6 FA(3) XSD paths before reconciliation; repository and archive fields are verifier-owned snapshot identities, live heads use public-IP-pinned GitHub REST, and the test suite re-executes the live census rather than trusting the committed report;
- the upstream gate replays 55 source records from 30 corpus HTTP resources, then replays four pinned CIRFMF license resources, for 34 total HTTP resources;
- browser WASM and independent `xmllint` validity-class gates agree with 28 expected-valid and 16 expected-invalid FA(3) source records.

## Challenge criteria

### WebMCP leverage

WebMCP is the primary interaction contract, not a decorative endpoint. The full collaboration loop uses active page state and six purpose-built tools.

### Execution

The project is a complete static product experience with official data, real XSD validation, proposal diffs, visible UI controls, history, provenance, responsive UI, reproducible build, CI, and E2E proof.

### Potential impact

Structured regulatory XML is high-friction and error-prone. The pattern generalizes to other schemas where agents should assist without becoming an invisible authority.

### Creativity and ambition

The project treats the web page as a shared review room—not a UI to bypass—and removes approval from the WebMCP capability surface while keeping the final decision visible in the interface.
