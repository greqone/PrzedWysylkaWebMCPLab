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
});
