import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const externalUrl = process.env.DEMO_URL;
const baseUrl = externalUrl ?? "http://127.0.0.1:4175";
const output = resolve("docs/assets/workbench.png");
await mkdir(resolve("docs/assets"), { recursive: true });

const server = externalUrl
  ? null
  : spawn(
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
  await page.getByRole("button", { name: "Validate XML" }).click();
  await page.getByText("Needs attention").waitFor();
  await page.getByRole("button", { name: "Stage guided repair" }).click();
  await page.getByRole("heading", { name: "Pending human approval" }).waitFor();
  await page.screenshot({ path: output, fullPage: true });

  if (errors.length) {
    throw new Error(`Browser runtime errors:\n${errors.join("\n")}`);
  }
  console.log(`Demo screenshot written to ${output}`);
} finally {
  await browser.close();
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, "exit", { signal: AbortSignal.timeout(5_000) });
  }
}
