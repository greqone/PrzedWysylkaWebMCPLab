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
});
