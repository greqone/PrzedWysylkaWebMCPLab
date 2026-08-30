import { describe, expect, test } from "vitest";

type Replacement = { search: string; replacement: string; reason: string };
type ReplacementModule = {
  applyExactReplacements(
    source: string,
    replacements: Replacement[],
  ): {
    content: string;
    changes: Array<Replacement & { start: number; end: number }>;
  };
};

async function loadModule(): Promise<ReplacementModule | null> {
  return import("./replacements").catch(
    () => null,
  ) as Promise<ReplacementModule | null>;
}

describe("exact replacement proposals", () => {
  test("applies unique non-overlapping replacements atomically", async () => {
    const module = await loadModule();
    expect(module, "replacement module must exist").not.toBeNull();
    if (!module) return;

    const source = "<NIP>#nip#</NIP><Data>#date#</Data>";
    const result = module.applyExactReplacements(source, [
      { search: "#nip#", replacement: "1111111111", reason: "Fill NIP" },
      { search: "#date#", replacement: "2026-08-30", reason: "Fill date" },
    ]);

    expect(result.content).toBe("<NIP>1111111111</NIP><Data>2026-08-30</Data>");
    expect(result.changes).toHaveLength(2);
    expect(source).toContain("#nip#");
  });

  test.each([
    [
      "empty search",
      [{ search: "", replacement: "x", reason: "bad" }],
      "<NIP>#nip#</NIP>",
    ],
    [
      "missing search",
      [{ search: "#missing#", replacement: "x", reason: "bad" }],
      "<NIP>#nip#</NIP>",
    ],
    [
      "ambiguous search",
      [{ search: "#nip#", replacement: "x", reason: "bad" }],
      "#nip# #nip#",
    ],
    [
      "overlapping searches",
      [
        { search: "abc", replacement: "x", reason: "bad" },
        { search: "bc", replacement: "y", reason: "bad" },
      ],
      "abc",
    ],
  ])("rejects %s", async (_name, replacements, customSource) => {
    const module = await loadModule();
    expect(module, "replacement module must exist").not.toBeNull();
    if (!module) return;

    expect(() =>
      module.applyExactReplacements(
        customSource ?? "<NIP>#nip#</NIP>",
        replacements,
      ),
    ).toThrow();
  });
});
