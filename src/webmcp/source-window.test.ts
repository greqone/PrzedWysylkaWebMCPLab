import { describe, expect, test } from "vitest";

type SourceWindowModule = {
  safeSourceBoundary(source: string, boundary: number): number;
  sliceSourceWindow(
    source: string,
    startLine: number,
    startColumn: number,
    lineCount: number,
  ): {
    text: string;
    totalLines: number;
    endLine: number;
    hasMore: boolean;
  };
  sourceCursorAfter(
    source: string,
    consumedCharacters: number,
    startLine: number,
    startColumn: number,
  ): { line: number; column: number };
};

async function loadModule(): Promise<SourceWindowModule | null> {
  return import("./source-window").catch(
    () => null,
  ) as Promise<SourceWindowModule | null>;
}

describe("exact official source windows", () => {
  test("slices logical lines without normalizing their delimiters", async () => {
    const module = await loadModule();
    expect(module, "source window module must exist").not.toBeNull();
    if (!module) return;

    const source = "A\r\nB\nC\rD😀\r\n";
    expect(module.sliceSourceWindow(source, 1, 0, 2)).toEqual({
      text: "A\r\nB\n",
      totalLines: 5,
      endLine: 2,
      hasMore: true,
    });
    expect(module.sliceSourceWindow(source, 3, 1, 2)).toEqual({
      text: "\rD😀\r\n",
      totalLines: 5,
      endLine: 4,
      hasMore: false,
    });
  });

  test("advances CRLF as one newline and never splits CRLF or a surrogate pair", async () => {
    const module = await loadModule();
    expect(module, "source window module must exist").not.toBeNull();
    if (!module) return;

    const source = "A\r\nB\rC\nD";
    expect(module.sourceCursorAfter(source, source.length, 1, 0)).toEqual({
      line: 4,
      column: 1,
    });
    expect(module.safeSourceBoundary("A\r\nB", 2)).toBe(1);
    expect(module.safeSourceBoundary("A😀B", 2)).toBe(1);
  });
});
