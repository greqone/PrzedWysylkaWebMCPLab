import { describe, expect, test } from "vitest";

type BudgetModule = {
  MAX_SERIALIZED_TOOL_RESULT_CHARS: number;
  truncateText(
    value: string,
    maxCodePoints: number,
  ): { value: string; truncated: boolean };
  assertToolPayloadBudget(payload: unknown, label: string): void;
};

async function loadModule(): Promise<BudgetModule | null> {
  return import("./output-budget").catch(
    () => null,
  ) as Promise<BudgetModule | null>;
}

describe("WebMCP output budget", () => {
  test("truncates at Unicode code-point boundaries and enforces 1,500 characters", async () => {
    const module = await loadModule();
    expect(module, "output budget module must exist").not.toBeNull();
    if (!module) return;

    expect(module.MAX_SERIALIZED_TOOL_RESULT_CHARS).toBe(1_500);
    expect(module.truncateText("A😀B", 2)).toEqual({
      value: "A😀",
      truncated: true,
    });
    expect(module.truncateText("A😀B", 3)).toEqual({
      value: "A😀B",
      truncated: false,
    });
    expect(() =>
      module.assertToolPayloadBudget({ value: "x".repeat(1_500) }, "oversized"),
    ).toThrow("oversized exceeds the 1,500-character WebMCP output budget");
    expect(() =>
      module.assertToolPayloadBudget({ value: "ok" }, "small"),
    ).not.toThrow();
  });
});
