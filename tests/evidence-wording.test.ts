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
});
