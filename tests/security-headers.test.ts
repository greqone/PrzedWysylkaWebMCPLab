import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("production security headers", () => {
  test("enables the official WebMCP tools feature only for the same origin", async () => {
    const config = await readFile(resolve("netlify.toml"), "utf8");
    const policy = config
      .split(/\r?\n/u)
      .find((line) => line.includes("Permissions-Policy ="));

    expect(policy).toBeDefined();
    expect(policy).toContain("tools=(self)");
    expect(policy).not.toContain("tools=(*)");
    expect(policy).not.toContain("tools=()");
  });

  test("keeps scripts, workers, forms, objects, and framing restricted", async () => {
    const config = await readFile(resolve("netlify.toml"), "utf8");
    const policy = config
      .split(/\r?\n/u)
      .find((line) => line.includes("Content-Security-Policy ="));

    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
