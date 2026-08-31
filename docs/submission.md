# Devpost Submission Draft

## Project name

PrzedWysylka WebMCP Lab

## Tagline

Validate official FA(3) XML with your browser agent—then keep the human in charge of every repair.

## Submission status

- Source repository: https://github.com/greqone/PrzedWysylkaWebMCPLab
- Public deployment URL: intentionally unassigned until operator-approved publication
- YouTube demo URL: intentionally unassigned until the final recording is reviewed and published

No URL is fabricated in this draft. The code, production build, E2E evidence, screenshot, and recording script are complete independently of those publication gates.

## What it does

PrzedWysylka WebMCP Lab is a browser-local workbench for Poland's official FA(3) structured invoice XML. A human and a browser agent share one visible workspace containing the complete frozen first-party scope: 26 Ministry examples, all 18 FA(3)-namespace XML source records from pinned CIRFMF C#, Java, and PDF-generator snapshots, one explicitly adjacent UBL fixture, the four-file canonical CRD closure, two C# schema records, and all four FA(3) XSD source records from the pinned CIRFMF API repository. Exact duplicates retain separate provenance and byte-identity links.

The agent does not scrape the UI. Six WebMCP tools let it list assets, read bounded source ranges, select a file, run canonical XSD validation, stage exact replacements, and inspect revision/hash/history state. A staged proposal appears immediately as a human-readable diff.

The critical boundary is structural, not conversational: there is no agent-callable approval tool. Only the human can approve or reject a proposal in the UI. Approval creates a new revision and triggers fresh local validation.

## Why this is a strong fit for WebMCP

XML compliance work combines dense source text, authoritative schemas, local state, and consequential edits. Visual browser automation is unnecessarily brittle: the agent must infer selection, scroll through findings, and simulate editor interactions. A backend MCP server would bypass the page, duplicate state, and weaken human visibility.

WebMCP lets the page expose exactly the capabilities it already owns while preserving the interface as the shared collaboration surface. The agent gets deterministic structured actions; the human keeps context, history, diff review, and final authority.

## What becomes better

Before WebMCP, an agent would need to inspect DOM text, guess which schema is active, click through controls, and type directly into a document editor. With WebMCP it can:

1. discover all 55 first-party records;
2. select the official parameterized template;
3. run the canonical validator;
4. read only the relevant lines;
5. stage two exact replacements;
6. stop at a visible human approval gate.

The human sees the same selected file, finding, proposal, and audit trail throughout the flow.

## How WebMCP is implemented

The app feature-detects `document.modelContext` and registers six imperative tools with `document.modelContext.registerTool()`. Tool definitions use static descriptions, JSON input schemas, read-only/untrusted-content annotations where applicable, Zod input validation, and one AbortController for lifecycle cleanup.

All tool callbacks reuse the same asset registry, validator, replacement engine, and workspace store as the human UI. Unsupported browsers receive no polyfill and display an honest compatibility state.

## Privacy and integrity

- Static site; no application backend.
- Validation runs through libxml2 compiled to WebAssembly.
- No uploads, accounts, cookies, analytics, or KSeF API calls.
- All 55 official records are SHA-256 and byte-count locked.
- Original sources remain immutable.
- Exact replacements must be unique and non-overlapping.
- Approval is human-only and stale proposals fail closed.
- XML is rendered as escaped text and marked untrusted when returned through WebMCP.

## Built with

- WebMCP draft API (`document.modelContext.registerTool`)
- React 19 + TypeScript 6 + Vite 8
- `xmllint-wasm` / libxml2
- Zod
- Vitest + Playwright + Axe
- Static Netlify-compatible deployment

## Verification evidence

The automated suite proves:

- complete 55-record source inventory, byte hashes, and duplicate graph;
- an independent default-tree census partitions all 39 XML and 31 XSD paths from six live pinned `main` heads and discovers exactly 18 FA(3) XML and 6 FA(3) XSD paths before reconciling them with the manifest; all repository/archive fields are verifier-owned snapshot identities, live heads use public-IP-pinned GitHub REST, bounded ZIP64/central/local-header and expansion checks finish before archive extraction, and the test suite re-executes the live census, independently asserting a temporary result rather than trusting the committed report;
- live upstream replay of all 55 records across 30 corpus HTTP resources plus four pinned CIRFMF license resources—34 total HTTP resources—with bounded streaming, globally routable DNS-only pinned connections, peer-IP revalidation, and manifest/scope-bound evidence;
- all 26 Ministry examples pass canonical FA(3) validation;
- all 18 CIRFMF FA(3) source records match their declared classes: two expected-valid and 16 expected-invalid;
- browser-WASM corpus validation plus an independent native `xmllint` validity-class check;
- atomic/stale-safe proposal behavior;
- exactly six registered WebMCP tools and no approval tool;
- real Chromium with a standards-shaped injected WebMCP harness: registration → validation → stage → human approval → valid revision;
- no page/console errors and no serious/critical Axe violations in that flow;
- ordinary-browser fallback remains usable.

This automated evidence proves the application's registration and callback contract, but it does not prove browser-native WebMCP API, permission, or agent compatibility. A manual smoke in the actual target environment, without the injected harness, is required before the final submission and recording.

## Challenge criteria

### WebMCP leverage

WebMCP is the primary interaction contract, not a decorative endpoint. The full collaboration loop uses active page state and six purpose-built tools.

### Execution

The project is a complete static product experience with official data, real XSD validation, proposal diffs, human controls, history, provenance, responsive UI, reproducible build, CI, and E2E proof.

### Potential impact

Structured regulatory XML is high-friction and error-prone. The pattern generalizes to other schemas where agents should assist without becoming an invisible authority.

### Creativity and ambition

The project treats the web page as a shared review room—not a UI to bypass—and encodes human authority by removing approval from the agent capability surface entirely.
