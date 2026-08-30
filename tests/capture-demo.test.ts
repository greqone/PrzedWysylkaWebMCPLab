import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("demo capture safety", () => {
  test("rejects DEMO_URL before navigation or screenshot overwrite", () => {
    const screenshot = resolve(root, "docs/assets/workbench.png");
    const before = readFileSync(screenshot);
    const result = spawnSync(
      process.execPath,
      [resolve(root, "scripts/capture-demo.mjs")],
      {
        cwd: root,
        env: { ...process.env, DEMO_URL: "http://127.0.0.1:1" },
        encoding: "utf8",
        timeout: 15_000,
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DEMO_URL is not supported");
    expect(readFileSync(screenshot)).toEqual(before);
  }, 20_000);
});
