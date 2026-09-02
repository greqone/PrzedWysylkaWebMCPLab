import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const baseUrl = "http://127.0.0.1:4176";
const evidencePath = resolve(root, "docs/assets/native-webmcp-smoke.json");
const screenshotPath = resolve(root, "docs/assets/native-workbench.png");
const expectedToolNames = [
  "get_workspace_status",
  "list_official_assets",
  "read_official_asset",
  "select_official_asset",
  "stage_exact_replacements",
  "validate_workspace",
];
const ansiColorPattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*m`,
  "gu",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function chromeCandidates() {
  const candidates = [];
  if (process.env.WEBMCP_CHROME_PATH?.trim()) {
    candidates.push(resolve(process.env.WEBMCP_CHROME_PATH.trim()));
  }
  if (process.platform === "win32") {
    for (const base of [
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
      process.env.LOCALAPPDATA,
    ]) {
      if (base)
        candidates.push(resolve(base, "Google/Chrome/Application/chrome.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/opt/google/chrome/chrome",
    );
  }
  return [...new Set(candidates)];
}

function findChrome() {
  const candidates = chromeCandidates();
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (executable) return executable;
  throw new Error(
    `Google Chrome was not found. Set WEBMCP_CHROME_PATH. Checked: ${candidates.join(", ") || "no default paths"}`,
  );
}

function delay(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

const server = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4176",
    "--strictPort",
  ],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
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

async function waitForOwnedPreview() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverCloseState !== null) {
      throw new Error(
        `Owned preview closed before readiness (${JSON.stringify(serverCloseState)}):\n${serverOutput}`,
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
    `Owned preview did not become ready at ${baseUrl}:\n${serverOutput}`,
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

async function executeTool(page, name, input) {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const modelContext = globalThis.document.modelContext;
      if (!modelContext)
        throw new Error("document.modelContext is unavailable");
      const tool = (await globalThis.document.modelContext.getTools()).find(
        (candidate) => candidate.name === toolName,
      );
      if (!tool) throw new Error(`Native WebMCP tool is missing: ${toolName}`);
      const raw = await globalThis.document.modelContext.executeTool(
        tool,
        JSON.stringify(toolInput),
      );
      if (typeof raw !== "string") {
        throw new Error(
          `Native WebMCP tool ${toolName} returned a non-string result`,
        );
      }
      const envelope = JSON.parse(raw);
      if (envelope?.isError) {
        throw new Error(`Native WebMCP tool ${toolName} returned an error`);
      }
      const text = envelope?.content?.find(
        (item) => item?.type === "text" && typeof item.text === "string",
      )?.text;
      if (typeof text !== "string") {
        throw new Error(
          `Native WebMCP tool ${toolName} returned no text payload`,
        );
      }
      return JSON.parse(text);
    },
    { toolName: name, toolInput: input },
  );
}

async function waitForApprovedStatus(page) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await executeTool(page, "get_workspace_status", {});
    if (
      status.revision === 1 &&
      status.validation?.valid === true &&
      status.pendingProposal === null
    ) {
      return status;
    }
    await delay(100);
  }
  throw new Error("Approved revision did not become schema-valid in time");
}

let browser = null;
try {
  await waitForOwnedPreview();
  const chromePath = findChrome();
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--enable-features=WebMCPTesting"],
    timeout: 30_000,
  });
  const chromeVersion = browser.version();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const runtimeErrors = [];
  page.on("pageerror", (error) =>
    runtimeErrors.push(`pageerror: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    runtimeErrors.push(
      `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      runtimeErrors.push(`http: ${response.status()} ${response.url()}`);
    }
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.getByText("6 WebMCP tools live", { exact: true }).waitFor();

  const nativeModelContext = await page.evaluate(
    () => typeof globalThis.document.modelContext === "object",
  );
  assert(
    nativeModelContext,
    "Chrome did not expose native document.modelContext",
  );
  const toolNames = await page.evaluate(async () =>
    (await globalThis.document.modelContext.getTools())
      .map((tool) => tool.name)
      .sort((left, right) => left.localeCompare(right)),
  );
  if (expectedToolNames.length !== 6) {
    throw new Error(
      "The expected native WebMCP surface must contain six tools",
    );
  }
  assert(
    JSON.stringify(toolNames) === JSON.stringify(expectedToolNames),
    `Unexpected native WebMCP tool surface: ${toolNames.join(", ")}`,
  );
  const forbiddenTools = toolNames.filter((name) =>
    /approve|apply|download|export|reject|submit|upload/iu.test(name),
  );
  const agentApprovalTools = toolNames.filter((name) =>
    /approve|apply|reject|submit/iu.test(name),
  );
  assert(
    forbiddenTools.length === 0,
    `Agent-facing approval tools are forbidden: ${forbiddenTools.join(", ")}`,
  );

  const catalog = await executeTool(page, "list_official_assets", {
    offset: 0,
    limit: 6,
  });
  assert(
    catalog.total === 55 && catalog.returned === 6 && catalog.hasMore === true,
    "The native catalog did not expose the expected bounded 55-record corpus",
  );
  const excerpt = await executeTool(page, "read_official_asset", {
    assetId: "cirfmf-template-base",
    startLine: 1,
    lineCount: 5,
  });
  assert(
    excerpt.range?.startLine === 1,
    "Native source excerpt has a wrong range",
  );

  await executeTool(page, "select_official_asset", {
    assetId: "cirfmf-template-base",
  });
  const before = await executeTool(page, "validate_workspace", {
    target: "approved-draft",
  });
  assert(
    before.valid === false,
    "The official template must fail before repair",
  );
  assert(before.revision === 0, "The initial approved revision must be zero");

  const staged = await executeTool(page, "stage_exact_replacements", {
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
  const approveButton = page.getByRole("button", { name: "Approve changes" });
  await approveButton.waitFor({ state: "visible" });
  const approvalDisabledBeforePreflight = await approveButton.isDisabled();
  assert(
    approvalDisabledBeforePreflight,
    "Human approval must be disabled before proposal preflight",
  );

  const proposalPreflight = await executeTool(page, "validate_workspace", {
    target: "pending-proposal",
  });
  assert(
    proposalPreflight.valid === true,
    "The staged proposal preflight failed",
  );
  assert(
    proposalPreflight.proposalId === staged.proposalId,
    "Proposal preflight proof is bound to the wrong proposal",
  );
  assert(
    /^[a-f0-9]{64}$/u.test(proposalPreflight.contentSha256),
    "Proposal preflight did not return a SHA-256 binding",
  );
  await page
    .getByText("Schema valid before approval", { exact: true })
    .waitFor({ state: "visible" });
  assert(
    await approveButton.isEnabled(),
    "Human approval did not unlock after proof",
  );
  const screenshotBytes = await page.screenshot({ fullPage: false });

  await page.getByRole("button", { name: "Approve changes" }).click();
  const after = await waitForApprovedStatus(page);
  await page
    .getByText("Schema valid", { exact: true })
    .waitFor({ state: "visible" });
  await delay(100);
  assert(
    runtimeErrors.length === 0,
    `Browser runtime errors:\n${runtimeErrors.join("\n")}`,
  );

  const sha256 = (value) => createHash("sha256").update(value).digest("hex");
  const evidence = {
    schemaVersion: 1,
    generatedBy: "npm run smoke:native",
    chromeVersion,
    featureFlag: "WebMCPTesting",
    nativeModelContext,
    injectedHarness: false,
    toolCount: toolNames.length,
    toolNames,
    hasAgentApprovalTool: agentApprovalTools.length > 0,
    catalog: {
      total: catalog.total,
      returned: catalog.returned,
      hasMore: catalog.hasMore,
    },
    excerpt: {
      startLine: excerpt.range.startLine,
      endLine: excerpt.range.endLine,
      truncated: excerpt.truncated,
    },
    before: {
      valid: before.valid,
      revision: before.revision,
      findingCount: before.findingCount,
    },
    proposalPreflight: {
      valid: proposalPreflight.valid,
      proposalId: proposalPreflight.proposalId,
      baseRevision: staged.baseRevision,
      contentSha256: proposalPreflight.contentSha256,
      findingCount: proposalPreflight.findingCount,
    },
    approval: {
      disabledBeforePreflight: approvalDisabledBeforePreflight,
      enabledAfterPreflight: true,
      performedBy: "playwright-ui-click",
    },
    after: {
      valid: after.validation.valid,
      revision: after.revision,
      pendingProposal: after.pendingProposal,
      draftSha256: after.draftSha256,
    },
    screenshotSha256: sha256(screenshotBytes),
    runtimeErrors,
  };

  await mkdir(resolve(root, "docs/assets"), { recursive: true });
  await writeFile(screenshotPath, screenshotBytes);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `Native WebMCP smoke passed in ${chromeVersion}: six tools, proof-gated UI approval path, revision 1 valid.`,
  );
} finally {
  try {
    await browser?.close();
  } finally {
    await stopOwnedPreview();
  }
}
