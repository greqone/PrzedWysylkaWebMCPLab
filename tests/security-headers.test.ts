import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

describe("production security headers", () => {
  test("keeps the document CSP aligned with the deployable policy", async () => {
    const [config, document] = await Promise.all([
      readFile(resolve("netlify.toml"), "utf8"),
      readFile(resolve("index.html"), "utf8"),
    ]);
    const deployedPolicy = config.match(
      /Content-Security-Policy = "([^"]+)"/u,
    )?.[1];
    const documentPolicy = document.match(
      /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/u,
    )?.[1];
    const metaCapableDeployedPolicy = deployedPolicy
      ?.split("; ")
      .filter((directive) => !directive.startsWith("frame-ancestors "))
      .join("; ");

    expect(documentPolicy).toBeDefined();
    expect(documentPolicy).toBe(metaCapableDeployedPolicy);
    expect(documentPolicy).toContain("connect-src 'self'");
    expect(documentPolicy).not.toMatch(/\b(?:ws|wss):/u);
  });

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

  test("origin-isolates WebMCP and serves a local favicon", async () => {
    const [config, document, favicon] = await Promise.all([
      readFile(resolve("netlify.toml"), "utf8"),
      readFile(resolve("index.html"), "utf8"),
      readFile(resolve("public/favicon.svg"), "utf8").catch(() => null),
    ]);

    expect(config).toContain('Origin-Agent-Cluster = "?1"');
    expect(document).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    );
    expect(favicon).not.toBeNull();
    expect(favicon).toContain("<svg");
    expect(favicon).toContain("PW");
  });
});
