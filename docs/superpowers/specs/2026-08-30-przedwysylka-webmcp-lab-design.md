# PrzedWysylka WebMCP Lab — Design

**Date:** 2026-08-30  
**Status:** Approved for autonomous implementation  
**Repository:** `greqone/PrzedWysylkaWebMCPLab`

## Product

PrzedWysylka WebMCP Lab is a static, browser-local workbench where a human and a browser agent inspect, validate, and safely repair official Polish FA(3) XML examples together. The agent can discover assets, read bounded source ranges, run validation, and stage exact replacements. Only the human can approve a staged proposal. No document, validation result, or draft is sent to an application backend.

The public project is clean-room code. It does not copy the private PrzedWysylka validator, repair rules, KSeF integrations, production configuration, or telemetry.

## Official corpus

The release contains every XML/XSD asset in the frozen first-party sources:

- 26 FA(3) XML examples from the official Ministry of Finance archive: all 26 validate against the canonical CRD schema closure.[12]
- Eighteen FA(3)-namespace XML source records from pinned CIRFMF C#, Java, and PDF-generator snapshots: 14 unique raw Git blobs, two expected-valid source records, and 16 expected-invalid template/edge-case records.[16][23][24]
- One adjacent PEF/UBL XML fixture from the same pinned client. It is catalogued as `related-ubl`, never represented as FA(3).
- Four canonical CRD XSD files: `schemat.xsd` plus its complete transitive import/include closure.[14]
- Two CIRFMF XSD source records. `StrukturyDanych_v10-0E.xsd` is byte-identical to CRD; CIRFMF `schemat.xsd` is a separate byte variant and is not used as the canonical validator root.[19]
- Four FA(3) XSD source records from pinned `CIRFMF/ksef-api`; the API root is byte-identical to the canonical CRD root and remains provenance-only.[25]

The result is 55 source records: 45 XML and 10 XSD. Completeness is defined against exact commits and exact source-path sets. FA(2), FA_RR, UPO, authentication, and PEF/UBL are distinct contracts and are excluded from the FA(3) completeness claim.

Every source record has a stable ID, source URL/path, pinned upstream revision where applicable, SHA-256, byte size, role, root namespace, expected validation class, and provenance/license note in `data/official-assets.lock.json`. Original bytes are immutable. Runtime resolver aliases are generated separately.

Project code is MIT. Third-party assets keep separate provenance in `THIRD_PARTY_NOTICES.md`; the CIRFMF repository is MIT-licensed.[17]

## Architecture

The application is a Vite 8 + React 19 + TypeScript SPA with no backend.

1. **Asset registry** loads the checked lock manifest and fetches immutable files from `/official-assets/`.
2. **Validation adapter** wraps public `xmllint-wasm` 5.3.0 behind a narrow `validateXml()` interface. Canonical CRD XSD is the only active validation set.
3. **Workspace store** owns the selected immutable original, approved draft, pending proposal, validation result, and auditable event history.
4. **WebMCP bridge** registers tools through `document.modelContext.registerTool()` following the WebMCP draft pinned at `41d12f0` and `webmcp-types` 0.1.5.[20][21]
5. **React workbench** renders the corpus, source viewer, validation findings, pending diff, human approval controls, history, and provenance.

WebMCP registration is feature-detected. Unsupported browsers show an honest compatibility status; no polyfill pretends that a normal browser exposes native WebMCP. Tests inject a model-context harness solely to exercise the adapter.

## WebMCP tools

- `list_official_assets`: filters metadata by kind and role; read-only.
- `read_official_asset`: returns a bounded line range from an official asset; read-only.
- `select_official_asset`: synchronizes the human UI to an asset.
- `validate_workspace`: validates the selected original or approved draft and surfaces the same result in the UI.
- `stage_exact_replacements`: validates a bounded list of exact search/replacement operations and stages a proposal. It never mutates the approved draft.
- `get_workspace_status`: returns selected asset, hashes, validation summary, pending state, and history metadata; read-only.

There is deliberately no WebMCP-callable `approve`, `apply`, `download`, or network tool. Approval and rejection remain visible UI events; the application does not infer actor identity from the event source.

Tool callbacks validate their own input because native input-schema validation remains an open part of the experimental specification. Tool descriptions contain only static developer-authored text; XML content is marked untrusted when returned.

## Human-agent flow

1. Human or agent selects one of the official assets.
2. Both see the same source and provenance.
3. Agent invokes validation; the UI shows normalized line-level findings.
4. Agent reads only the relevant bounded ranges and stages exact replacements with reasons.
5. UI presents a diff. The source remains unchanged.
6. Human approves or rejects.
7. Approval creates a new draft revision; validation is run again.
8. Human may download the approved draft and inspect the complete history.

The default demo uses the official parameterized FA(3) template. The raw template is expected to fail because placeholders such as `#nip#` violate schema facets; the agent can stage replacements while the human retains final authority.

## Failure and security model

- Asset hash mismatch, missing schema dependency, malformed manifest, or unexpected corpus count fails the build/test gate.
- Schema load failure is distinct from an invalid XML result.
- Replacement search strings must be non-empty, unique in the current base revision, and collectively non-overlapping; otherwise the proposal is rejected atomically.
- Proposal approval fails closed when its base revision is stale.
- XML is displayed as text, never inserted as HTML; no DTD/network entity resolution is exposed by the adapter.
- No cookies, accounts, analytics, local persistence, backend, KSeF API, or document upload exists in the contest build.
- CSP permits only application assets and the minimum worker/WASM execution required by the chosen bundle.

## Verification

- Hash and count gate for all locked source records.
- Browser `xmllint-wasm` corpus validation plus an independent native `xmllint` validity-class check for all 28 expected-valid and 16 expected-invalid FA(3) source records.
- Unit tests for registry filters, normalized findings, replacement atomicity, stale proposal protection, and history.
- Adapter tests proving six tools register with correct schemas/annotations and that staging cannot apply changes.
- Playwright flow with an injected WebMCP harness: discover → select → validate → stage → human approve → revalidate.
- Accessibility smoke with keyboard-only approval/rejection and no critical Axe findings.
- Required gates: `npm run verify:assets`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`.

## Submission boundary

Devpost requires a working live URL, public open-source repository containing `document.modelContext.registerTool()`, English description/testing instructions, and a public YouTube demo shorter than three minutes.[22] The repository therefore includes an English README, architecture/provenance notes, testing steps, submission copy, and a deterministic demo script. Deployment/publication and final submission remain explicit operator gates.

## Sources

[12] https://ksef.podatki.gov.pl/pliki-do-pobrania-ksef-20  
[14] https://crd.gov.pl/wzor/2025/06/25/13775  
[16] https://github.com/CIRFMF/ksef-client-csharp  
[17] https://github.com/CIRFMF/ksef-client-csharp/blob/04f01c1c7834336a3aef1804149cd5bcbd883a3e/LICENCE.txt  
[18] https://github.com/CIRFMF/ksef-client-csharp/blob/04f01c1c7834336a3aef1804149cd5bcbd883a3e/KSeF.Client.Tests.Core/Templates/invoice-template-fa-3.xml  
[19] https://github.com/CIRFMF/ksef-client-csharp/blob/04f01c1c7834336a3aef1804149cd5bcbd883a3e/KSeF.Client.Tests.Core/Schemas/schemat.xsd  
[20] https://github.com/webmachinelearning/webmcp/tree/41d12f057167ccf5954dbcf49d99502cb6c84491  
[21] https://www.npmjs.com/package/webmcp-types/v/0.1.5  
[22] https://webmcp.devpost.com/rules
[23] https://github.com/CIRFMF/ksef-client-java/tree/4e9b10a7c1ef1d1528bf2c1e82de1b4c9677e256
[24] https://github.com/CIRFMF/ksef-pdf-generator/tree/1835553940728b8cb88f8b0298da732d56a3d2a5
[25] https://github.com/CIRFMF/ksef-api/tree/93b843d5def041f69fe2a26d0d90a53e9fa9987a
