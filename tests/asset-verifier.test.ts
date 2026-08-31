import { createHash } from "node:crypto";
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
    expect(report.checked).toBe(55);
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

  test("rejects an unlocked XML or XSD file under official-assets", async () => {
    const verifier = await loadVerifier();
    expect(verifier, "asset verifier module must exist").not.toBeNull();
    if (!verifier) return;

    const root = mkdtempSync(resolve(tmpdir(), "webmcp-orphan-asset-"));
    mkdirSync(resolve(root, "data"), { recursive: true });
    mkdirSync(resolve(root, "public", "official-assets"), { recursive: true });
    const locked = Buffer.from("<locked/>");
    writeFileSync(
      resolve(root, "public", "official-assets", "locked.xml"),
      locked,
    );
    writeFileSync(
      resolve(root, "public", "official-assets", "orphan.xsd"),
      "<schema/>",
    );
    writeFileSync(
      resolve(root, "data", "official-assets.lock.json"),
      JSON.stringify({
        assets: [
          {
            id: "locked",
            localPath: "official-assets/locked.xml",
            sha256: createHash("sha256").update(locked).digest("hex"),
            bytes: locked.length,
          },
        ],
      }),
    );

    const report = verifier.verifyAssetManifest(root);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain(
      "unlocked official asset: official-assets/orphan.xsd",
    );
  });

  test("rejects two source records that share one localPath", async () => {
    const verifier = await loadVerifier();
    expect(verifier, "asset verifier module must exist").not.toBeNull();
    if (!verifier) return;

    const root = mkdtempSync(resolve(tmpdir(), "webmcp-duplicate-path-"));
    mkdirSync(resolve(root, "data"), { recursive: true });
    mkdirSync(resolve(root, "public", "official-assets"), { recursive: true });
    const bytes = Buffer.from("<same-file/>");
    writeFileSync(
      resolve(root, "public", "official-assets", "same.xml"),
      bytes,
    );
    const record = (id: string) => ({
      id,
      localPath: "official-assets/same.xml",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    });
    writeFileSync(
      resolve(root, "data", "official-assets.lock.json"),
      JSON.stringify({ assets: [record("first"), record("second")] }),
    );

    const report = verifier.verifyAssetManifest(root);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain(
      "second: duplicate localPath official-assets/same.xml",
    );
  });

  test("rejects duplicate metadata when source bytes differ from the target", async () => {
    const verifier = await loadVerifier();
    expect(verifier, "asset verifier module must exist").not.toBeNull();
    if (!verifier) return;

    const root = mkdtempSync(resolve(tmpdir(), "webmcp-duplicates-"));
    mkdirSync(resolve(root, "data"), { recursive: true });
    mkdirSync(resolve(root, "public", "official-assets"), { recursive: true });
    const canonical = Buffer.from("<canonical/>");
    const duplicate = Buffer.from("<different/>");
    writeFileSync(
      resolve(root, "public", "official-assets", "canonical.xml"),
      canonical,
    );
    writeFileSync(
      resolve(root, "public", "official-assets", "duplicate.xml"),
      duplicate,
    );
    writeFileSync(
      resolve(root, "data", "official-assets.lock.json"),
      JSON.stringify({
        assets: [
          {
            id: "canonical",
            localPath: "official-assets/canonical.xml",
            sha256: createHash("sha256").update(canonical).digest("hex"),
            bytes: canonical.length,
          },
          {
            id: "duplicate",
            localPath: "official-assets/duplicate.xml",
            sha256: createHash("sha256").update(duplicate).digest("hex"),
            bytes: duplicate.length,
            contentDuplicateOf: "canonical",
          },
        ],
      }),
    );

    const report = verifier.verifyAssetManifest(root);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain(
      "duplicate: contentDuplicateOf canonical does not match bytes",
    );
  });

  test.each([
    {
      name: "missing target",
      duplicateTarget: "absent",
      canonicalDuplicateTarget: undefined,
      expected: "duplicate: contentDuplicateOf target is missing",
    },
    {
      name: "self-reference",
      duplicateTarget: "duplicate",
      canonicalDuplicateTarget: undefined,
      expected: "duplicate: contentDuplicateOf cannot reference itself",
    },
    {
      name: "duplicate chain",
      duplicateTarget: "canonical",
      canonicalDuplicateTarget: "root",
      expected:
        "duplicate: contentDuplicateOf must reference a canonical asset",
    },
  ])("rejects $name in duplicate metadata", async (scenario) => {
    const verifier = await loadVerifier();
    expect(verifier, "asset verifier module must exist").not.toBeNull();
    if (!verifier) return;

    const root = mkdtempSync(resolve(tmpdir(), "webmcp-duplicate-graph-"));
    mkdirSync(resolve(root, "data"), { recursive: true });
    mkdirSync(resolve(root, "public", "official-assets"), { recursive: true });
    const bytes = Buffer.from("<same/>");
    for (const name of ["root", "canonical", "duplicate"]) {
      writeFileSync(
        resolve(root, "public", "official-assets", `${name}.xml`),
        bytes,
      );
    }
    const locked = (id: string, contentDuplicateOf?: string) => ({
      id,
      localPath: `official-assets/${id}.xml`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      ...(contentDuplicateOf ? { contentDuplicateOf } : {}),
    });
    writeFileSync(
      resolve(root, "data", "official-assets.lock.json"),
      JSON.stringify({
        assets: [
          locked("root"),
          locked("canonical", scenario.canonicalDuplicateTarget),
          locked("duplicate", scenario.duplicateTarget),
        ],
      }),
    );

    const report = verifier.verifyAssetManifest(root);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain(scenario.expected);
  });
});
