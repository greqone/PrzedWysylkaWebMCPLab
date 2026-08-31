import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { getAsset, listAssets } from "../src/assets/registry";

type SchemaBundle = {
  root: { fileName: string; contents: string };
  preload: Array<{ fileName: string; contents: string }>;
};

type ValidatorModule = {
  buildCanonicalSchemaBundle(
    loadById: (id: string) => Promise<string>,
  ): Promise<SchemaBundle>;
  validateXml(
    xml: string,
    fileName: string,
    options: { schemaBundle: SchemaBundle },
  ): Promise<{ valid: boolean; findings: unknown[]; rawOutput: string }>;
};

async function loadValidator(): Promise<ValidatorModule | null> {
  return import("../src/validation/validator").catch(
    () => null,
  ) as Promise<ValidatorModule | null>;
}

const root = resolve(import.meta.dirname, "..");

async function loadLocalAsset(id: string): Promise<string> {
  const asset = getAsset(id);
  return readFile(resolve(root, "public", asset.localPath), "utf8");
}

describe("FA(3) corpus validation", () => {
  test("builds resolver aliases without mutating locked source files", async () => {
    const validator = await loadValidator();
    expect(validator, "validator module must exist").not.toBeNull();
    if (!validator) return;

    const originalRoot = await loadLocalAsset("crd-fa3-schema");
    const bundle = await validator.buildCanonicalSchemaBundle(loadLocalAsset);

    expect(originalRoot).toContain('schemaLocation="http://crd.gov.pl/');
    expect(bundle.root.fileName).toBe("schemat.xsd");
    expect(bundle.root.contents).toContain(
      'schemaLocation="StrukturyDanych_v10-0E.xsd"',
    );
    expect(bundle.preload.map((file) => file.fileName)).toEqual([
      "StrukturyDanych_v10-0E.xsd",
      "ElementarneTypyDanych_v10-0E.xsd",
      "KodyKrajow_v10-0E.xsd",
    ]);
  });

  test("accepts all 26 Ministry examples", async () => {
    const validator = await loadValidator();
    expect(validator, "validator module must exist").not.toBeNull();
    if (!validator) return;

    const bundle = await validator.buildCanonicalSchemaBundle(loadLocalAsset);
    const examples = listAssets({ role: "mf-valid-example" });

    for (const asset of examples) {
      const result = await validator.validateXml(
        await loadLocalAsset(asset.id),
        `${asset.id}.xml`,
        { schemaBundle: bundle },
      );
      expect(result.valid, asset.id).toBe(true);
      expect(result.findings, asset.id).toEqual([]);
    }
  }, 120_000);

  test("matches declared validity for all 18 CIRFMF FA(3) source records", async () => {
    const validator = await loadValidator();
    expect(validator, "validator module must exist").not.toBeNull();
    if (!validator) return;

    const bundle = await validator.buildCanonicalSchemaBundle(loadLocalAsset);
    const fixtures = listAssets().filter(
      (asset) =>
        asset.kind === "xml" &&
        asset.namespace === "http://crd.gov.pl/wzor/2025/06/25/13775/" &&
        asset.sourceUrl.startsWith("https://raw.githubusercontent.com/CIRFMF/"),
    );

    expect(fixtures).toHaveLength(18);
    expect(
      fixtures.filter((asset) => asset.expectedValidation === "valid"),
    ).toHaveLength(2);
    expect(
      fixtures.filter(
        (asset) => asset.expectedValidation === "invalid-template",
      ),
    ).toHaveLength(16);

    for (const asset of fixtures) {
      const result = await validator.validateXml(
        await loadLocalAsset(asset.id),
        `${asset.id}.xml`,
        { schemaBundle: bundle },
      );
      const expectedValid = asset.expectedValidation === "valid";
      expect(result.valid, asset.id).toBe(expectedValid);
      if (expectedValid) {
        expect(result.findings, asset.id).toEqual([]);
      } else {
        expect(result.findings.length, asset.id).toBeGreaterThan(0);
      }
    }
  }, 120_000);
});
