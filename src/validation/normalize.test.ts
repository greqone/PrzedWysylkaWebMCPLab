import { describe, expect, test } from "vitest";

type NormalizerModule = {
  normalizeValidationErrors(
    errors: Array<{
      rawMessage: string;
      message: string;
      loc: { fileName: string; lineNumber: number } | null;
    }>,
  ): Array<{
    fileName: string | null;
    line: number | null;
    message: string;
    raw: string;
  }>;
};

async function loadNormalizer(): Promise<NormalizerModule | null> {
  return import("./normalize").catch(
    () => null,
  ) as Promise<NormalizerModule | null>;
}

describe("validation finding normalization", () => {
  test("removes xmllint schema boilerplate and preserves location", async () => {
    const normalizer = await loadNormalizer();
    expect(normalizer, "normalizer module must exist").not.toBeNull();
    if (!normalizer) return;

    const findings = normalizer.normalizeValidationErrors([
      {
        rawMessage:
          "invoice.xml:12: element NIP: Schemas validity error : Element 'NIP': value '#nip#' is invalid.",
        message:
          "element NIP: Schemas validity error : Element 'NIP': value '#nip#' is invalid.",
        loc: { fileName: "invoice.xml", lineNumber: 12 },
      },
    ]);

    expect(findings).toEqual([
      {
        fileName: "invoice.xml",
        line: 12,
        message: "Element 'NIP': value '#nip#' is invalid.",
        raw: expect.stringContaining("Schemas validity error"),
      },
    ]);
  });

  test("deduplicates identical findings without inventing a location", async () => {
    const normalizer = await loadNormalizer();
    expect(normalizer, "normalizer module must exist").not.toBeNull();
    if (!normalizer) return;

    const error = {
      rawMessage: "Document does not validate",
      message: "Document does not validate",
      loc: null,
    };

    expect(normalizer.normalizeValidationErrors([error, error])).toEqual([
      {
        fileName: null,
        line: null,
        message: "Document does not validate",
        raw: "Document does not validate",
      },
    ]);
  });
});
