import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

if (process.env.DEMO_URL !== undefined) {
  throw new Error(
    "DEMO_URL is not supported; capture:demo only runs the repository's local production preview",
  );
}

const baseUrl = "http://127.0.0.1:4175";
const output = resolve("docs/assets/workbench.png");
const expectedToolNames = [
  "get_workspace_status",
  "list_official_assets",
  "read_official_asset",
  "select_official_asset",
  "stage_exact_replacements",
  "validate_workspace",
];
await mkdir(resolve("docs/assets"), { recursive: true });

const server = spawn(
  process.execPath,
  [
    resolve("node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4175",
    "--strictPort",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server && server.exitCode !== null) {
      throw new Error(
        `Preview server exited before readiness with code ${server.exitCode}`,
      );
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview process is still binding the local socket.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Preview server did not become ready at ${baseUrl}`);
}

const browser = await chromium.launch();
try {
  await waitForServer();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    const tools = new Map();
    Object.defineProperty(globalThis, "__webMcpCaptureHarness", {
      configurable: true,
      value: {
        names: () => [...tools.keys()].sort(),
        async execute(name, input) {
          const tool = tools.get(name);
          if (!tool) throw new Error(`Tool is not registered: ${name}`);
          return tool.execute(input, {
            signal: new AbortController().signal,
          });
        },
      },
    });
    Object.defineProperty(globalThis.document, "modelContext", {
      configurable: true,
      value: {
        async registerTool(tool, options) {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener(
            "abort",
            () => tools.delete(tool.name),
            { once: true },
          );
        },
      },
    });
  });

  await page.goto(baseUrl);
  await page.getByText("6 WebMCP tools live").waitFor();
  const registeredNames = await page.evaluate(() =>
    globalThis.__webMcpCaptureHarness.names(),
  );
  if (JSON.stringify(registeredNames) !== JSON.stringify(expectedToolNames)) {
    throw new Error(
      `Unexpected WebMCP tool surface: ${registeredNames.join(", ")}`,
    );
  }
  const forbiddenTools = registeredNames.filter((name) =>
    /approve|apply|download|export|reject|submit|upload/iu.test(name),
  );
  if (forbiddenTools.length) {
    throw new Error(
      `Forbidden WebMCP tools registered: ${forbiddenTools.join(", ")}`,
    );
  }

  await page.evaluate(async () => {
    const harness = globalThis.__webMcpCaptureHarness;
    await harness.execute("select_official_asset", {
      assetId: "cirfmf-template-base",
    });
    await harness.execute("validate_workspace", {});
    await harness.execute("stage_exact_replacements", {
      summary: "Replace both official CIRFMF template placeholders",
      replacements: [
        {
          search: "#nip#",
          replacement: "1111111111",
          reason: "Use a schema-compatible ten-digit demonstration NIP",
        },
        {
          search: "#invoice_number#",
          replacement: "FV/2026/001",
          reason: "Use a deterministic demonstration invoice number",
        },
      ],
    });
  });
  await page.getByText("Needs attention").waitFor();
  await page.getByRole("heading", { name: "Pending human approval" }).waitFor();
  await page.screenshot({ path: output, fullPage: true });

  if (errors.length) {
    throw new Error(`Browser runtime errors:\n${errors.join("\n")}`);
  }
  console.log(
    `Demo screenshot written to ${output} using the injected six-tool WebMCP harness`,
  );
} finally {
  await browser.close();
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, "exit", { signal: AbortSignal.timeout(5_000) });
  }
}
