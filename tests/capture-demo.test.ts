import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("demo capture safety", () => {
  test("rejects DEMO_URL before navigation or screenshot overwrite", () => {
    const screenshot = resolve(root, "docs/assets/workbench.png");
    const evidence = resolve(root, "docs/assets/workbench.capture.json");
    const before = readFileSync(screenshot);
    const evidenceBefore = readFileSync(evidence);
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
    expect(readFileSync(evidence)).toEqual(evidenceBefore);
  }, 20_000);

  test("rejects a foreign listener instead of accepting its readiness", async () => {
    const screenshot = resolve(root, "docs/assets/workbench.png");
    const evidence = resolve(root, "docs/assets/workbench.capture.json");
    const before = readFileSync(screenshot);
    const evidenceBefore = readFileSync(evidence);
    const foreign = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><body>6 WebMCP tools live</body>");
    });
    await new Promise<void>((resolvePromise, reject) => {
      foreign.once("error", reject);
      foreign.listen(4175, "127.0.0.1", resolvePromise);
    });

    let child: ReturnType<typeof spawn> | null = null;
    try {
      child = spawn(
        process.execPath,
        [resolve(root, "scripts/capture-demo.mjs")],
        {
          cwd: root,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout?.on("data", (chunk) => {
        output += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        output += String(chunk);
      });
      const [exitCode] = await once(child, "exit", {
        signal: AbortSignal.timeout(20_000),
      });

      expect(exitCode).not.toBe(0);
      expect(output).toContain("Preview server exited before owned readiness");
      expect(readFileSync(screenshot)).toEqual(before);
      expect(readFileSync(evidence)).toEqual(evidenceBefore);
    } finally {
      if (child?.exitCode === null) child.kill();
      await new Promise<void>((resolvePromise) =>
        foreign.close(() => resolvePromise()),
      );
    }
  }, 25_000);
});
