import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "data/official-assets.lock.json");
const attributesPath = resolve(root, ".gitattributes");

type LockedAsset = {
  id: string;
  kind: "xml" | "xsd";
  role: string;
  localPath: string;
  sha256: string;
};

describe("official asset lock", () => {
  test("contains the complete frozen first-party corpus", () => {
    expect(existsSync(manifestPath), "asset lock must exist").toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      assets: LockedAsset[];
    };
    const byRole = manifest.assets.reduce<Record<string, LockedAsset[]>>(
      (groups, asset) => {
        (groups[asset.role] ??= []).push(asset);
        return groups;
      },
      {},
    );

    expect(byRole["mf-valid-example"]).toHaveLength(26);
    expect(byRole["cirfmf-fa3-template"]).toHaveLength(3);
    expect(byRole["related-ubl"]).toHaveLength(1);
    expect(byRole["canonical-xsd-root"]).toHaveLength(1);
    expect(byRole["canonical-xsd-dependency"]).toHaveLength(3);
    expect(byRole["cirfmf-xsd-source"]).toHaveLength(2);
    expect(new Set(manifest.assets.map((asset) => asset.id)).size).toBe(
      manifest.assets.length,
    );
  });

  test("pins official asset bytes as binary in Git", () => {
    expect(existsSync(attributesPath), ".gitattributes must exist").toBe(true);
    const attributes = readFileSync(attributesPath, "utf8");
    expect(attributes).toContain("public/official-assets/** -text");
  });

  test("locks every asset to an existing local file and SHA-256", () => {
    expect(existsSync(manifestPath), "asset lock must exist").toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      assets: LockedAsset[];
    };

    for (const asset of manifest.assets) {
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(
        existsSync(resolve(root, "public", asset.localPath)),
        asset.id,
      ).toBe(true);
    }
  });
});
