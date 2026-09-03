import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const documentationFiles = [
  "README.md",
  "docs/submission.md",
  "docs/superpowers/specs/2026-08-30-przedwysylka-webmcp-lab-design.md",
];

describe("evidence wording", () => {
  test("describes the native gate as a validity-class check, not diagnostic parity", () => {
    const nativeScript = resolve(root, "scripts/verify-native-validity.mjs");
    expect(existsSync(nativeScript)).toBe(true);
    if (!existsSync(nativeScript)) return;

    expect(readFileSync(nativeScript, "utf8")).toContain(
      "Native validity-class check verified",
    );
    for (const relativePath of documentationFiles) {
      const content = readFileSync(resolve(root, relativePath), "utf8");
      expect(content, relativePath).not.toMatch(/\bparity\b/iu);
    }
  });

  test("does not present the injected WebMCP harness as native-agent evidence", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const submission = readFileSync(
      resolve(root, "docs/submission.md"),
      "utf8",
    );
    const demoScript = readFileSync(
      resolve(root, "docs/demo-script.md"),
      "utf8",
    );

    expect(readme).toContain("standards-shaped injected WebMCP harness");
    expect(submission).not.toMatch(/real Chromium agent/iu);
    expect(submission).toContain(
      "does not prove browser-native WebMCP API, permission, or agent compatibility",
    );
    expect(demoScript).toContain(
      "Do not inject the automated WebMCP harness into the final recording",
    );
  });

  test("describes approval as a UI-only capability without inventing a human actor", () => {
    const scopedFiles = [
      "README.md",
      "docs/submission.md",
      "docs/architecture.md",
      "docs/superpowers/specs/2026-08-30-przedwysylka-webmcp-lab-design.md",
      "docs/superpowers/specs/2026-08-31-przedwysylka-winning-pass-design.md",
      "docs/superpowers/plans/2026-08-31-przedwysylka-winning-pass.md",
      "src/components/HistoryPanel.tsx",
      "src/components/ProposalPanel.tsx",
      "src/webmcp/register-tools.ts",
    ];
    const forbiddenClaims = [
      /Approved by human/iu,
      /Rejected by human/iu,
      /only a person can approve/iu,
      /Approval is human-only/iu,
      /human-only approval (?:button|control|controls)/iu,
      /only the human UI can cross the approval boundary/iu,
      /Approval and rejection are human-only UI events/iu,
      /human-only gate/iu,
      /approval, rejection, and download (?:remain|are) human-only/iu,
      /human-approved (?:draft|revision)/iu,
    ];

    for (const relativePath of scopedFiles) {
      const content = readFileSync(resolve(root, relativePath), "utf8");
      for (const forbidden of forbiddenClaims) {
        expect(content, `${relativePath}: ${forbidden}`).not.toMatch(forbidden);
      }
    }

    const history = readFileSync(
      resolve(root, "src/components/HistoryPanel.tsx"),
      "utf8",
    );
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(history).toContain('"proposal-approved": "Approved in UI"');
    expect(history).toContain('"proposal-rejected": "Rejected in UI"');
    expect(readme).toContain("absent from the WebMCP capability surface");
    expect(readme).toContain(
      "browser automation may still actuate UI controls",
    );
  });

  test("documents final output, cancellation, source-fidelity, and native-evidence contracts", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const submission = readFileSync(
      resolve(root, "docs/submission.md"),
      "utf8",
    );
    const architecture = readFileSync(
      resolve(root, "docs/architecture.md"),
      "utf8",
    );

    expect(readme).toContain(
      "Every successful WebMCP text payload is hard-limited to 1,500 serialized characters",
    );
    expect(readme).toContain("original CRLF, LF, and CR delimiters");
    expect(readme).toContain("`messageTruncated`");
    expect(readme).toContain("`historyHasMore`");
    expect(readme).toContain("cannot commit after cancellation");
    expect(readme).toContain("evidence schema version 2");
    expect(readme).toContain("deterministic production-artifact digest");
    expect(readme).toContain(
      "preflight hash, pending-status hash, store-proof hash, and final draft hash are equal",
    );

    expect(submission).toContain(
      "Every successful tool text payload is capped at 1,500 serialized characters",
    );
    expect(submission).toContain(
      "preserve original CRLF, LF, and CR delimiters",
    );
    expect(submission).toContain("cannot commit after cancellation");
    expect(submission).toContain("schema version 2");
    expect(submission).toContain("production artifact digest");

    expect(architecture).toContain("post-abort selection commit");
    expect(architecture).toContain("UTF-16 code-unit column cursor");
    expect(architecture).toContain("Every successful tool text payload");
    expect(architecture).toContain("directory-sha256-v1");
  });

  test("documents the native proof-carrying judge path and current clients", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const submission = readFileSync(
      resolve(root, "docs/submission.md"),
      "utf8",
    );
    const demoScript = readFileSync(
      resolve(root, "docs/demo-script.md"),
      "utf8",
    );
    const architecture = readFileSync(
      resolve(root, "docs/architecture.md"),
      "utf8",
    );
    const exactPrompt =
      "Open the base FA(3) template, validate it, then stage exact replacements for its two placeholders. Validate the pending proposal, but do not approve it.";

    expect(readme).toContain(
      "**Agent proposes. Schema proves. Human approves.**",
    );
    expect(readme).toContain("docs/assets/native-workbench.png");
    expect(readme).toContain("docs/assets/native-webmcp-smoke.json");
    expect(readme).toContain("## 30-second judge path");
    expect(readme).toContain(exactPrompt);
    expect(readme).toMatch(/\|\s*Without WebMCP\s*\|\s*With WebMCP\s*\|/u);
    expect(readme).toContain("GPT-5.6 Sol or GPT-5.6 Terra");
    expect(readme).toContain("GPT-5.6 Luna currently has WebMCP disabled");
    expect(readme).toContain("chrome://flags/#enable-webmcp-testing");
    expect(readme).toContain("expect exactly six tools");

    expect(submission).toContain("proof-bound native Chrome smoke");
    expect(submission).toContain("schema-valid SHA-256 proof");
    expect(submission).toContain(
      "store derives SHA-256 from the validated-content snapshot",
    );
    expect(submission).toContain(
      "Every successful tool text payload is capped at 1,500 serialized characters",
    );
    expect(submission).toContain(
      "automated Playwright click through the UI-only review control",
    );
    expect(submission).not.toContain("performs a human UI click");
    expect(submission).toContain("Revision 1 validates again");

    expect(demoScript).toContain(exactPrompt);
    expect(demoScript.indexOf("Validate the pending proposal")).toBeLessThan(
      demoScript.indexOf("Click `Approve changes` manually"),
    );

    for (const binding of ["proposalId", "baseRevision", "proposedSha256"]) {
      expect(architecture).toContain(binding);
    }
    expect(architecture).toContain("invalidates the proof");
  });

  test("keeps public corpus claims aligned with the 55-record frozen inventory", () => {
    const corpusFiles = [
      "README.md",
      "THIRD_PARTY_NOTICES.md",
      "docs/architecture.md",
      "docs/demo-script.md",
      "docs/submission.md",
      "docs/superpowers/specs/2026-08-30-przedwysylka-webmcp-lab-design.md",
      "docs/superpowers/plans/2026-08-30-przedwysylka-webmcp-lab.md",
    ];

    for (const relativePath of corpusFiles) {
      const content = readFileSync(resolve(root, relativePath), "utf8");
      expect(content, relativePath).not.toMatch(/\b36[- ](?:record|locked)/iu);
      expect(content, relativePath).not.toMatch(/\b30 XML\b/iu);
      expect(content, relativePath).not.toMatch(/\bthree CIRFMF FA\(3\)/iu);
    }

    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).toContain("55 locked source records");
    expect(readme).toContain("44 FA(3) XML source records");
    expect(readme).toContain("18 CIRFMF FA(3) XML source records");
    expect(readme).toContain("10 XSD");
  });

  test("separates corpus replay from pinned license-byte replay", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const submission = readFileSync(
      resolve(root, "docs/submission.md"),
      "utf8",
    );

    for (const [path, content] of [
      ["README.md", readme],
      ["docs/submission.md", submission],
    ] as const) {
      expect(content, path).toContain("30 corpus HTTP resources");
      expect(content, path).toContain("four pinned CIRFMF license resources");
      expect(content, path).toContain("34 total HTTP resources");
      expect(content, path).not.toMatch(
        /all 55 records across 30 first-party HTTP resources/iu,
      );
    }
    expect(readme).toContain(
      "pins each TCP connection to a validated globally routable IP",
    );
  });

  test("grounds CIRFMF completeness in an independent default-tree census", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const submission = readFileSync(
      resolve(root, "docs/submission.md"),
      "utf8",
    );

    for (const [path, content] of [
      ["README.md", readme],
      ["docs/submission.md", submission],
    ] as const) {
      expect(content, path).toContain("39 XML and 31 XSD paths");
      expect(content, path).toContain("18 FA(3) XML and 6 FA(3) XSD paths");
      expect(content, path).toContain("independent default-tree census");
      expect(content, path).toContain("test suite re-executes the live census");
      expect(content, path).toContain("verifier-owned snapshot identities");
      expect(content, path).toContain("public-IP-pinned GitHub REST");
    }
    expect(readme).toContain("npm run verify:scope");
    expect(readme).toContain("docs/assets/cirfmf-tree-census.json");
  });
});
