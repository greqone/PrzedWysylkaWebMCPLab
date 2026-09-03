import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

if (process.env.DEMO_URL !== undefined) {
  throw new Error(
    "DEMO_URL is not supported; capture:demo only runs the repository's local production preview",
  );
}

const baseUrl = "http://127.0.0.1:4175";
const output = resolve("docs/assets/workbench.png");
const evidenceOutput = resolve("docs/assets/workbench.capture.json");
const ansiColorPattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  "gu",
);
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
let serverOutput = "";
let serverCloseState = null;
const serverClosed = new Promise((resolvePromise) => {
  server.once("close", (code, signal) => {
    serverCloseState = { code, signal };
    resolvePromise(serverCloseState);
  });
});
server.on("error", (error) => {
  serverOutput += `\nspawn error: ${error.message}`;
});
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => {
    serverOutput += String(chunk);
  });
}

function delay(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverCloseState !== null) {
      throw new Error(
        `Preview server exited before owned readiness (${JSON.stringify(serverCloseState)})${serverOutput ? `:\n${serverOutput}` : ""}`,
      );
    }
    const plainOutput = serverOutput.replace(ansiColorPattern, "");
    if (plainOutput.includes("Local:") && plainOutput.includes(baseUrl)) {
      try {
        const response = await fetch(baseUrl, { cache: "no-store" });
        if (response.ok) return;
      } catch {
        // The owned process has announced the URL but is still binding it.
      }
    }
    await delay(100);
  }
  throw new Error(
    `Preview server did not become ready at ${baseUrl}${serverOutput ? `:\n${serverOutput}` : ""}`,
  );
}

async function waitForServerClose(timeoutMilliseconds = 5_000) {
  let timeoutId;
  try {
    await Promise.race([
      serverClosed,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Owned preview did not close in time")),
          timeoutMilliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function stopOwnedPreview() {
  if (serverCloseState !== null) return;
  server.kill();
  try {
    await waitForServerClose();
    return;
  } catch {
    // Escalate only while the pre-attached close promise is still pending.
  }
  if (serverCloseState === null) server.kill("SIGKILL");
  await waitForServerClose();
}

let browser = null;
try {
  await waitForServer();
  browser = await chromium.launch();
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

  const proposalPreflight = await page.evaluate(async () => {
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
    const result = await harness.execute("validate_workspace", {
      target: "pending-proposal",
    });
    return JSON.parse(result.content[0]?.text ?? "null");
  });
  await page.getByText("Needs attention").waitFor();
  await page.getByRole("heading", { name: "Pending human approval" }).waitFor();
  await page
    .getByText("Schema valid before approval", { exact: true })
    .waitFor();
  const approvalEnabled = await page
    .getByRole("button", { name: "Approve changes" })
    .isEnabled();
  if (!approvalEnabled) {
    throw new Error("UI approval did not unlock after proposal preflight");
  }
  const screenshotBytes = await page.screenshot({ fullPage: true });

  if (errors.length) {
    throw new Error(`Browser runtime errors:\n${errors.join("\n")}`);
  }
  const manifestBytes = await readFile(
    resolve("data/official-assets.lock.json"),
  );
  const sourceScopeBytes = await readFile(
    resolve("data/official-source-scope.json"),
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const fa3Namespace = "http://crd.gov.pl/wzor/2025/06/25/13775/";
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const evidence = {
    schemaVersion: 1,
    generatedBy: "npm run capture:demo",
    evidenceScope:
      "real Chromium with a standards-shaped injected WebMCP harness; not browser-native API or agent proof",
    manifestSha256: sha256(manifestBytes),
    sourceScopeSha256: sha256(sourceScopeBytes),
    screenshotSha256: sha256(screenshotBytes),
    corpus: {
      records: manifest.assets.length,
      xml: manifest.assets.filter((asset) => asset.kind === "xml").length,
      xsd: manifest.assets.filter((asset) => asset.kind === "xsd").length,
      fa3Xml: manifest.assets.filter(
        (asset) => asset.kind === "xml" && asset.namespace === fa3Namespace,
      ).length,
    },
    toolNames: registeredNames,
    selectedAssetId: "cirfmf-template-base",
    state: "proposal-preflight-valid",
    proposalPreflight: {
      valid: proposalPreflight.valid,
      findingCount: proposalPreflight.findingCount,
      contentSha256: proposalPreflight.contentSha256,
    },
    approvalEnabled,
  };
  await writeFile(output, screenshotBytes);
  await writeFile(evidenceOutput, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Demo screenshot and provenance written to ${output} using the injected six-tool WebMCP harness`,
  );
} finally {
  try {
    await browser?.close();
  } finally {
    await stopOwnedPreview();
  }
}
