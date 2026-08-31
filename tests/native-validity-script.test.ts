import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("native FA(3) validity-class gate", () => {
  test("checks every expected-valid and expected-invalid FA(3) source record", () => {
    const result = spawnSync(
      process.execPath,
      [resolve(root, "scripts/verify-native-validity.mjs")],
      {
        cwd: root,
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "28 expected-valid and 16 expected-invalid FA(3) source records",
    );
  }, 120_000);
});
