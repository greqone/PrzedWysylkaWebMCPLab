# PrzedWysylka WebMCP Lab

**A browser-local FA(3) XML workbench where a human and a browser agent inspect official data, run canonical XSD validation, and review exact repairs together.**

![PrzedWysylka WebMCP Lab showing an invalid official template and a pending human approval](docs/assets/workbench.png)

**Evidence scope:** the committed screenshot and automated E2E run real Chromium with a standards-shaped injected WebMCP harness. They prove the app's registration, callback, shared-state, validation, and human-gate behavior; they do not claim to test a browser vendor's native agent implementation.

[`docs/assets/workbench.capture.json`](docs/assets/workbench.capture.json) binds the screenshot to the exact manifest and PNG SHA-256, corpus totals, six registered tool names, selected asset, and pending-human-approval state.

## Why this exists

Structured tax XML is an unusually good WebMCP problem. A visual browser agent can click through an editor, but it should not have to guess which schema is authoritative, scrape line numbers, or silently rewrite a compliance document. The page already owns that context.

PrzedWysylka WebMCP Lab exposes six narrow browser-native tools through `document.modelContext.registerTool()`. The agent can discover the complete first-party corpus, inspect bounded source ranges, run the same local validator as the human, and stage exact replacements. **There is no agent-callable approval tool.** The human sees a diff and explicitly approves or rejects it in the UI.

## The collaboration loop

1. Select any official XML or XSD asset.
2. Validate an FA(3) XML against the canonical four-file CRD closure.
3. Ask the browser agent to inspect the finding and stage exact replacements.
4. Review the pending diff. The approved draft is still unchanged.
5. Approve or reject in the human UI.
6. Approval creates a new revision and triggers fresh browser-local validation.
7. Inspect the audit trail and byte-level provenance.

Try this prompt in ChatGPT Desktop's browser or WebMCP-enabled Chrome:

> Open the base FA(3) template, validate it, then stage exact replacements for its two placeholders. Do not approve them.

## WebMCP tool surface

| Tool                       | Effect                                                               | Guardrail                                                |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `list_official_assets`     | Returns filtered corpus metadata                                     | Read-only                                                |
| `read_official_asset`      | Returns at most 120 source lines                                     | Read-only, untrusted-content annotation                  |
| `select_official_asset`    | Synchronizes the shared UI selection                                 | Loads only a locked official asset                       |
| `validate_workspace`       | Runs canonical FA(3) validation and mirrors findings into the UI     | Cannot validate XSD or the adjacent UBL fixture as FA(3) |
| `stage_exact_replacements` | Creates an atomic pending proposal                                   | Exact, unique, non-overlapping matches; never applies    |
| `get_workspace_status`     | Returns revision, hashes, validation, proposal, and history metadata | Read-only                                                |

Tool inputs are validated with Zod because native WebMCP input-schema validation remains experimental. All descriptions are static developer-authored strings. XML returned to an agent is explicitly annotated as untrusted content.

## Complete official corpus

The repository does not cherry-pick convenient examples.

| Source class                              | Count | Runtime role                                                |
| ----------------------------------------- | ----: | ----------------------------------------------------------- |
| Ministry of Finance FA(3) example XMLs    |    26 | Expected-valid canonical examples                           |
| CIRFMF FA(3) expected-invalid XML records |    16 | Templates and edge-case fixtures                            |
| CIRFMF FA(3) expected-valid XML records   |     2 | Byte-identical PDF-generator source records                 |
| CIRFMF PEF/UBL XML fixture                |     1 | Adjacent source fixture, explicitly not classified as FA(3) |
| Canonical CRD XSD closure                 |     4 | Active validation root plus all transitive dependencies     |
| CIRFMF C# client XSD source records       |     2 | Provenance/comparison only                                  |
| CIRFMF API FA(3) XSD source records       |     4 | Pinned API-repository provenance                            |

That is **55 locked source records: 45 XML and 10 XSD**, including **44 FA(3) XML source records** and one explicitly adjacent UBL record. The CIRFMF portion contains **18 CIRFMF FA(3) XML source records** from pinned C#, Java, and PDF-generator repositories; they represent 14 unique raw Git blobs. Exact byte duplicates remain separate provenance records and declare `contentDuplicateOf`.

The frozen scope is mechanical: every XML whose default namespace is the canonical FA(3) `13775` namespace in the pinned CIRFMF C#, Java, and PDF-generator snapshots; every XSD directly under the FA schema set in the pinned CIRFMF API snapshot; all 26 XMLs in the official Ministry archive; and the complete canonical CRD closure. FA(2), FA_RR, UPO, authentication, and PEF/UBL are different contracts and are excluded from the FA(3) completeness claim. [`data/official-source-scope.json`](data/official-source-scope.json) records the observation date, definition, exclusions, all six CIRFMF repository pins—including zero-match repositories—and source-record versus unique-blob totals. Every included record has its source URL/path, upstream revision, byte length, SHA-256, namespace, role, and expected validation class in [`data/official-assets.lock.json`](data/official-assets.lock.json).

The bundled XML/XSD files are excluded from this repository's MIT license. See the [notice stored beside the assets](public/official-assets/NOTICE.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

`npm run verify:assets` hashes all 55 files and verifies every exact-duplicate relationship. Git treats official assets as binary (`-text -diff`) so Windows line-ending conversion cannot corrupt upstream bytes. Every browser fetch also verifies the exact byte count and SHA-256 before decoding or displaying the source.

## Privacy and safety

- No backend, account, cookies, analytics, database, KSeF API, or document upload.
- Validation runs in the current browser tab through `xmllint-wasm`.
- No XML, draft, finding, or history record is sent to an application server.
- Original assets are immutable; proposals target the current approved revision.
- The workspace store defaults to denying replacement proposals unless the typed registry marks the selected source as eligible FA(3) XML.
- Runtime asset paths reject traversal, encoded path segments, backslashes, queries, and fragments before fetch.
- Latest-wins selection and validation operation tokens reject out-of-order or stale asynchronous completions.
- Stale, ambiguous, duplicate, missing, or overlapping replacements fail atomically.
- XML is rendered as escaped text, never injected as HTML.
- The production WebMCP API is feature-detected. Unsupported browsers receive an honest status; no polyfill pretends native support.
- Approval, rejection, and download exist only as human UI actions.

## Clean-room public boundary

This repository was created during the challenge window. It does **not** contain code copied from the private PrzedWysylka product, production repair rules, KSeF integrations, credentials, configuration, telemetry, or customer data. The implementation is a small clean-room wrapper over public dependencies and public first-party fixtures.

## Run locally

Requirements:

- Node.js `22.22.2`
- npm 10+

```bash
npm ci
npm run dev
```

Open the URL printed by Vite.

### Native WebMCP support

- ChatGPT Desktop's in-app browser supports WebMCP.
- Chrome 149+ can use the WebMCP testing flag/origin trial described by the challenge.
- In ordinary browsers, the complete human UI and local validator still work; the header reports `WebMCP unavailable`.

## Verification

```bash
npm run verify:assets   # SHA-256, byte count, and duplicate graph for all 55 assets
npm test                # unit, contract, corpus, and React interaction tests
npm run typecheck
npm run lint
npm run build           # production bundle, browser worker, and WASM
npm run test:e2e        # real Chromium + standards-shaped injected WebMCP harness + Axe
```

The automated browser tests do not prove browser-native WebMCP API, permission-policy enforcement, or native-agent compatibility. Before submission, run the final smoke and recording in the actual target environment—ChatGPT Desktop's in-app browser or WebMCP-enabled Chrome—without injecting the test harness.

Optional independent native validity-class gate:

```bash
npm run verify:native
```

It independently checks every FA(3) source record against its declared validity class: 28 expected-valid and 16 expected-invalid records. It compares validity classes, not diagnostic text or line-number identity. Set `XMLLINT_BIN` if `xmllint` is not on `PATH`.

Optional networked upstream replay gate (Python 3):

```bash
npm run verify:upstreams
```

It re-downloads all 55 corpus records from 30 corpus HTTP resources, then replays four pinned CIRFMF license resources, for 34 total HTTP resources. Every response and ZIP member is streamed against its exact expected byte count with absolute size caps and a total deadline before SHA-256 comparison. The verifier disables environment proxies, rejects every non-global DNS answer, pins each TCP connection to a validated globally routable IP, rechecks the connected peer, and still uses the official hostname for Host, TLS SNI, and certificate validation. The gate writes [`docs/assets/upstream-verification.json`](docs/assets/upstream-verification.json), bound to the manifest and source-scope SHA-256. This is intentionally a freeze/review gate rather than an offline build dependency.

To regenerate the committed product screenshot from a fresh local production build and execute the registered select → validate → stage callbacks through the injected capture harness:

```bash
npm run capture:demo
```

## Architecture

```text
hash-locked official assets
          │
          ▼
typed asset registry ───────────────┐
          │                         │
          ▼                         ▼
canonical CRD resolver aliases   WebMCP bridge
          │                         │
          ▼                         │
 xmllint browser worker             │
          │                         │
          └────────► workspace store ◄──────── React UI
                         │
               original / approved draft
                  / pending proposal
                         │
                   human-only gate
```

See [`docs/architecture.md`](docs/architecture.md) for component boundaries and threat controls.

## Challenge materials

- [`docs/submission.md`](docs/submission.md) — English Devpost copy
- [`docs/demo-script.md`](docs/demo-script.md) — sub-three-minute video runbook
- [`docs/assets/upstream-verification.json`](docs/assets/upstream-verification.json) — live first-party byte replay evidence
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — asset and dependency provenance

The public deployment and final submission remain explicit operator actions.

## License

Original project code is released under the [MIT License](LICENSE). Third-party official XML/XSD assets retain their own provenance and are not relicensed by this repository; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
