# PrzedWysylka WebMCP Competition Winning Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-subagent-driven-development (recommended) or superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merged FA(3) workbench natively executable through Chrome WebMCP, require schema-valid proof before human approval, bound agent outputs, and present the collaboration flow clearly to judges.

**Architecture:** Keep the existing six-tool imperative bridge and shared workspace store. Extend the store with target-aware validation contexts and proposal proof, reuse one SHA-256 helper across UI/tools, and add a separate native Chrome smoke runner that invokes the production page without injecting a model context.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, Playwright 1.62, `xmllint-wasm`, native Chrome WebMCP testing feature.

## Global Constraints

- Baseline commit: `566b7e89edeb68e4852a4bc9a788eb2ddb0813c0`.
- Preserve exactly six imperative top-level WebMCP tools.
- Preserve all 55 immutable official asset records and canonical CRD validation.
- Approval, rejection, and download remain human-only.
- No customer XML upload, backend, account, telemetry, KSeF call, or extra dependency.
- Do not publish, deploy, submit, commit, or push without a separate operator instruction.
- Every code task follows RED → GREEN → focused regression before the broad gates.

---

### Task 1: Native callback compatibility

**Files:**

- Modify: `src/webmcp/register-tools.test.ts`
- Modify: `src/webmcp/register-tools.ts`

**Interfaces:**

- Consumes: native tool callback where `ToolExecuteCallbackOptions` may be absent at runtime.
- Produces: `callbackSignal(options?: WebMCP.ToolExecuteCallbackOptions): AbortSignal` and a `validate_workspace` callback that accepts one or two arguments.

- [ ] **Step 1: Add a failing native-callback regression**

Register the tools, select `cirfmf-template-base`, and invoke `validate_workspace.execute({})` without a second argument. Assert that the injected validator receives an `AbortSignal`, returns an invalid result, and updates store validation instead of throwing a destructuring error.

```ts
const validation = tools.get("validate_workspace");
const result = await validation?.execute({});
expect(validateSignal).toBeInstanceOf(AbortSignal);
expect(parseTextResult(result)).toMatchObject({
  target: "approved-draft",
  valid: false,
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- src/webmcp/register-tools.test.ts -t "accepts native callbacks without an options object"
```

Expected: FAIL with `Cannot destructure property 'signal' of 'undefined'`.

- [ ] **Step 3: Implement the compatibility boundary**

Add a helper that does not alter browsers which provide cancellation:

```ts
function callbackSignal(
  options?: WebMCP.ToolExecuteCallbackOptions,
): AbortSignal {
  return options?.signal ?? new AbortController().signal;
}
```

Change the validation callback from destructuring the second parameter to accepting `options` and calling `callbackSignal(options)`.

- [ ] **Step 4: Verify GREEN and existing registration behavior**

```bash
npm test -- src/webmcp/register-tools.test.ts
```

Expected: all WebMCP registration tests pass.

---

### Task 2: Target-aware validation and proof-carrying proposal state

**Files:**

- Create: `src/workspace/sha256.ts`
- Modify: `src/workspace/types.ts`
- Modify: `src/workspace/store.ts`
- Modify: `src/workspace/store.test.ts`

**Interfaces:**

- Produces:
  - `type ValidationTarget = "approved-draft" | "pending-proposal"`;
  - `sha256Text(value: string): Promise<string>`;
  - `ProposalValidationProof` with asset ID, `proposalId`, `baseRevision`, `documentGeneration`, validated content, `proposedSha256`, and `result`;
  - `startValidation(target?: ValidationTarget): ValidationContext` where context captures exact `content` and optional `proposalId`;
  - `recordValidation(result, context): Promise<string>` derives SHA-256 inside the store;
  - `WorkspaceState.proposalValidation`;
  - approval that requires a current valid proposal proof.

- [ ] **Step 1: Write failing store tests for proof lifecycle**

Add tests that establish these contracts:

```ts
const context = store.startValidation("pending-proposal");
expect(context.content).toBe(proposal.proposedContent);
await store.recordValidation(validResult, context);
expect(store.getState().proposalValidation).toMatchObject({
  proposalId: proposal.id,
  proposedSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
  result: { valid: true },
});
store.approveProposal(proposal.id);
expect(store.getState().revision).toBe(1);
```

Also assert:

- approval before preflight throws `Proposal requires a current valid preflight`;
- invalid preflight cannot be approved;
- an older concurrent proposal-validation result is stale;
- rejection and asset selection clear proof;
- approval clears proof and pending proposal;
- approved-draft validation continues to update `state.validation`.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/workspace/store.test.ts
```

Expected: new types/method behavior is absent and tests fail.

- [ ] **Step 3: Implement target-aware state**

Use a single monotonically increasing validation operation ID for both targets. A current pending-proposal context must match all of:

```ts
context.target === "pending-proposal";
context.proposalId === state.pendingProposal?.id;
context.revision === state.revision;
context.documentGeneration === state.documentGeneration;
context.content === state.pendingProposal?.proposedContent;
```

Store proof only after those checks pass. `approveProposal()` must call the existing stale-proposal guard and then require matching proof with `result.valid === true`.

Add `proposal-validation-completed` to `WorkspaceEventType` and emit summaries for valid and invalid proposal preflights.

- [ ] **Step 4: Add shared SHA-256 helper**

Move the browser-safe implementation from `register-tools.ts` into:

```ts
export async function sha256Text(value: string | null): Promise<string | null> {
  if (value === null) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- src/workspace/store.test.ts
```

Expected: all store lifecycle tests pass.

---

### Task 3: Bounded six-tool contract and proposal preflight

**Files:**

- Modify: `src/webmcp/register-tools.ts`
- Modify: `src/webmcp/register-tools.test.ts`
- Modify: `tests/e2e/webmcp-harness.ts` only if its result parsing needs the new fields

**Interfaces:**

- `list_official_assets` input gains `offset` and `limit` (`1..6`, default `6`).
- `read_official_asset.lineCount` becomes default `20`, maximum `30`; `startColumn` and `nextColumn` support continuation inside long lines while the full serialized payload stays at or below 1,500 characters.
- `validate_workspace.target` is optional and defaults to `approved-draft`.
- Validation output includes `target`, `findingCount`, `returnedFindings`, `truncated`, `revision`, optional `proposalId`, and `contentSha256`.
- `get_workspace_status.pendingProposal` includes `validation` proof metadata.

- [ ] **Step 1: Replace full-catalog assertions with failing explicit-pagination assertions**

Assert the default page:

```ts
expect(catalog).toMatchObject({
  total: 55,
  returned: 6,
  offset: 0,
  limit: 6,
  hasMore: true,
  nextOffset: 6,
});
expect(catalog.assets).toHaveLength(6);
```

Assert a final page and filtered page use the filtered `total`, never silently omit `hasMore`, and reject `limit: 7`.

- [ ] **Step 2: Add failing read and validation budget tests**

Assert `lineCount: 31` is rejected, the default returns at most 20 lines with `nextLine`, and a demo catalog/read result serializes near the 1,500-character target. Assert validation returns at most five findings while preserving the complete count.

- [ ] **Step 3: Add failing pending-proposal tool flow**

Select and stage a proposal, then invoke:

```ts
await validateTool.execute({ target: "pending-proposal" }, { signal });
```

Assert the exact proposed content reaches the validator, proof appears in store/status, and approval is impossible before but possible after valid preflight.

- [ ] **Step 4: Verify RED**

```bash
npm test -- src/webmcp/register-tools.test.ts
```

- [ ] **Step 5: Implement schemas and bounded outputs**

Use Zod defaults and strict objects. Paginate after applying filters. Return compact list entries with `id`, `title`, `kind`, `role`, and `expectedValidation` only.

For validation:

1. parse target;
2. get a store context capturing exact content;
3. validate `context.content`;
4. compute SHA-256;
5. record the result against the context;
6. return no more than five findings.

Use the shared `sha256Text` helper for status hashes and proposal proof.

- [ ] **Step 6: Verify GREEN and measure outputs**

```bash
npm test -- src/webmcp/register-tools.test.ts
```

Expected: all tool contract tests pass and demo-path output budget assertions are green.

---

### Task 4: Human-visible proof and connected/manual mode

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/AgentGuide.tsx`
- Modify: `src/components/AppHeader.tsx`
- Modify: `src/components/ValidationPanel.tsx`
- Modify: `src/components/ProposalPanel.tsx`
- Modify: `src/styles.css`
- Modify: `tests/e2e/workbench.spec.ts`

**Interfaces:**

- App gets one reusable `runValidation(target)` function.
- `ProposalPanel` receives proof, preflight pending state, connected state, and manual-preflight handler.
- `ValidationPanel` receives `showManualFallback` rather than unconditional guided-repair exposure.
- `AgentGuide` receives WebMCP status and exposes a copy-prompt control plus three workflow steps.

- [ ] **Step 1: Write failing React tests**

Connected-mode test:

- status shows six tools;
- manual staging button is absent;
- agent-staged proposal shows `Waiting for agent preflight`;
- approval is disabled;
- valid proposal proof shows `Schema valid before approval` and enables approval;
- approval creates revision 1 and final validation.

Ordinary-browser test:

- button is labeled `Manual demo fallback`;
- staged proposal exposes `Validate proposed change`;
- valid manual preflight enables approval;
- invalid preflight keeps approval disabled and draft unchanged.

Add a copy-prompt test with a mocked `navigator.clipboard.writeText`.

- [ ] **Step 2: Write failing E2E collaboration assertions**

Update harness flow to call `validate_workspace` with `target: "pending-proposal"` after staging and before the human click. Assert the source is unchanged, preflight proof is visible, and no connected-mode manual stage button exists.

Update fallback E2E to use `Manual demo fallback`, manually preflight, then reject or approve.

- [ ] **Step 3: Verify RED**

```bash
npm test -- src/App.test.tsx
npm run test:e2e
```

- [ ] **Step 4: Implement UI state and copy**

Header line:

```text
Agent proposes · Schema proves · Human approves
```

Agent guide steps:

```text
1 Agent proposes
2 Schema proves
3 Human approves
```

The proposal panel must show proof result, finding count, and first 12 SHA-256 characters. Approval stays disabled unless proof is current and valid. Connected mode has no staging or proposal-validation shortcut button.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- src/App.test.tsx
npm run test:e2e
```

---

### Task 5: Native production smoke and browser polish

**Files:**

- Create: `scripts/native-webmcp-smoke.mjs`
- Create: `public/favicon.svg`
- Create after successful run: `docs/assets/native-webmcp-smoke.json`
- Create after successful run: `docs/assets/native-workbench.png`
- Modify: `index.html`
- Modify: `package.json`
- Modify: `netlify.toml`
- Test: `tests/native-webmcp-smoke.test.ts`

**Interfaces:**

- `npm run smoke:native` builds, starts an owned preview, launches Chrome with `WebMCPTesting`, and performs the full real callback flow.
- `WEBMCP_CHROME_PATH` overrides browser discovery.

- [ ] **Step 1: Write a failing script-contract test**

The source test asserts the native smoke:

- imports Playwright but never imports the injected harness;
- includes only `--enable-features=WebMCPTesting`;
- checks exactly six tools and no approval/apply/download tool;
- invokes approved and pending-proposal validation;
- clicks `Approve changes` through the human UI;
- writes both evidence files;
- owns and terminates its preview process.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/native-webmcp-smoke.test.ts
```

- [ ] **Step 3: Implement the native smoke runner**

Discover Chrome from `WEBMCP_CHROME_PATH` first, then OS defaults. Spawn `node_modules/vite/bin/vite.js preview` on `127.0.0.1:4176`. Poll the URL with bounded retries, launch native Chrome, and use `document.modelContext.getTools()` plus `executeTool(tool, JSON.stringify(input))`.

Capture the pre-approval screenshot only after valid proposal proof is visible. Evidence JSON contains:

```json
{
  "schemaVersion": 1,
  "nativeModelContext": true,
  "injectedHarness": false,
  "toolCount": 6,
  "hasAgentApprovalTool": false,
  "before": { "valid": false, "revision": 0 },
  "proposalPreflight": { "valid": true },
  "after": { "valid": true, "revision": 1 },
  "runtimeErrors": []
}
```

Always close Chrome and terminate the owned server in `finally`.

- [ ] **Step 4: Add browser metadata and deployment isolation**

Link `/favicon.svg` in `index.html`. Add `Origin-Agent-Cluster = "?1"` to Netlify top-level headers without weakening CSP or Permissions Policy.

Add scripts:

```json
"smoke:native": "npm run build && node scripts/native-webmcp-smoke.mjs"
```

- [ ] **Step 5: Verify native GREEN**

```bash
npm test -- tests/native-webmcp-smoke.test.ts
npm run smoke:native
```

Expected: native evidence records six tools, invalid → valid proposal proof → automated traversal of the human-only UI gate → valid revision, with no runtime errors.

---

### Task 6: Judge-facing documentation and submission copy

**Files:**

- Modify: `README.md`
- Modify: `docs/submission.md`
- Modify: `docs/demo-script.md`
- Modify: `docs/architecture.md`
- Modify: `docs/assets/workbench.capture.json` only through the existing capture command if the harness screenshot changes
- Modify: `docs/assets/workbench.png` only through `npm run capture:demo`
- Modify: evidence wording tests discovered by `npm test`

**Interfaces:**

- README links the native evidence and describes the injected harness separately.
- Testing instructions name supported ChatGPT models and the Chrome flag.
- Submission and video use the proof-carrying sequence.

- [ ] **Step 1: Rewrite README first fold**

Order the first sections as:

1. value proposition and `Agent proposes. Schema proves. Human approves.`;
2. native screenshot and honest publication gate;
3. 30-second judge path;
4. exact prompt;
5. before/after WebMCP table;
6. specific audience and problem;
7. technical evidence and corpus details.

Move the injected-harness caveat into Verification. Add native smoke instructions and evidence links.

- [ ] **Step 2: Update testing instructions**

State exactly:

- use current ChatGPT Desktop;
- use GPT-5.6 Sol or GPT-5.6 Terra;
- GPT-5.6 Luna currently has WebMCP disabled;
- inspect `Site tools` and expect six tools;
- alternatively use Chrome 149+ with `chrome://flags/#enable-webmcp-testing`.

- [ ] **Step 3: Rewrite Devpost copy and video runbook**

The demo sequence becomes:

```text
invalid approved draft
→ native agent stages exact changes
→ native agent validates pending proposal
→ UI shows schema-valid proof + hash
→ human approves visibly
→ final revision validates again
```

Keep the video under three minutes and retain the legal/copyright checklist.

- [ ] **Step 4: Update architecture and generated screenshot**

Document target-aware validation and proof invalidation. Run:

```bash
npm run capture:demo
```

Update evidence wording tests to match true claims; never present harness evidence as native evidence.

- [ ] **Step 5: Verify documentation contracts**

```bash
npm test
npm run format:check
```

Expected: evidence and copy tests pass with no stale six-tool/output claims.

---

### Task 7: Release metadata, full gates, and independent review

**Files:**

- Modify only if needed: `.github/workflows/ci.yml`
- External metadata: private GitHub topics only; no visibility/homepage change without live deployment approval.

**Interfaces:**

- Repository remains private.
- Topics become `webmcp`, `human-in-the-loop`, `xml`, `fa3`, and `browser-agent`.

- [ ] **Step 1: Add safe repository topics**

Use `gh repo edit` to add the five topics. Re-read metadata to verify. Leave homepage empty because no deployment URL exists, and do not change visibility.

- [ ] **Step 2: Run focused and broad gates with exact Node 22.22.2**

```bash
npm run verify:assets
npm run verify:native
npm test
npm run typecheck
npm run lint
npm run format:check
npm audit --audit-level=high
npm run build
npm run test:e2e
npm run smoke:native
```

All must exit zero. The native smoke must use the production build and no injected harness.

- [ ] **Step 3: Inspect final diff and generated evidence**

```bash
git status --short
git diff --check
git diff --stat
git diff
```

Confirm no secrets, absolute local paths, generated test trash, public release action, or unrelated formatting entered the diff.

- [ ] **Step 4: Run independent hostile review**

Provide the reviewer with baseline `566b7e8`, current diff, exact design, test output, and native evidence. Fail the review for any Critical/Important issue involving native API compatibility, stale proof acceptance, approval bypass, output truncation ambiguity, false native-evidence wording, security headers, or publication side effects.

- [ ] **Step 5: Fix every blocking review finding and re-run affected plus broad gates**

A green review is required before handoff. Do not commit or push; report the working-tree diff and verified commands to the operator.
