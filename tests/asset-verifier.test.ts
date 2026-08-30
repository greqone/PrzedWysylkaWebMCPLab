import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

type VerificationReport = {
  ok: boolean;
  checked: number;
  errors: string[];
};

type VerifierModule = {
  verifyAssetManifest(root: string): VerificationReport;
};

async function loadVerifier(): Promise<VerifierModule | null> {
  return import("../scripts/asset-verifier.mjs").catch(
    () => null,
  ) as Promise<VerifierModule | null>;
}

describe("asset verifier", () => {
  test("accepts the frozen repository corpus", async () => {
    const verifier = await loadVerifier();
    expect(verifier, "asset verifier module must exist").not.toBeNull();
    if (!verifier) return;

    const report = verifier.verifyAssetManifest(
      resolve(import.meta.dirname, ".."),
    );

    expect(report.ok).toBe(true);
    expect(report.checked).toBe(36);
    expect(report.errors).toEqual([]);
  });

  test("rejects a file whose bytes do not match the lock", async () => {
    const verifier = await loadVerifier();
    expect(verifier, "asset verifier module must exist").not.toBeNull();
    if (!verifier) return;

    const root = mkdtempSync(resolve(tmpdir(), "webmcp-assets-"));
    mkdirSync(resolve(root, "data"), { recursive: true });
    mkdirSync(resolve(root, "public", "official-assets"), { recursive: true });
    writeFileSync(
      resolve(root, "public", "official-assets", "fixture.xml"),
      "<changed/>",
    );
    writeFileSync(
      resolve(root, "data", "official-assets.lock.json"),
      JSON.stringify({
        assets: [
          {
            id: "fixture",
            localPath: "official-assets/fixture.xml",
            sha256: "0".repeat(64),
            bytes: 10,
          },
        ],
      }),
    );

    const report = verifier.verifyAssetManifest(root);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("fixture: SHA-256 mismatch");
  });
});
