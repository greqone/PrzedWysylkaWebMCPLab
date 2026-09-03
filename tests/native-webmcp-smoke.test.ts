import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

async function sourceOrEmpty(path: string) {
  return readFile(resolve(root, path), "utf8").catch(() => "");
}

async function bytesOrEmpty(path: string) {
  return readFile(resolve(root, path)).catch(() => Buffer.alloc(0));
}

async function productionArtifactDigest(directory: string) {
  const files: string[] = [];
  const walk = async (current: string) => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`Unsupported dist entry: ${path}`);
    }
  };
  await walk(directory);
  files.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  const hash = createHash("sha256").update("directory-sha256-v1\0");
  let byteCount = 0;
  for (const file of files) {
    const path = relative(directory, file).split(sep).join("/");
    const pathBytes = Buffer.from(path, "utf8");
    const contents = await readFile(file);
    byteCount += contents.length;
    hash.update(`${pathBytes.length}:`);
    hash.update(pathBytes);
    hash.update(`:${contents.length}:`);
    hash.update(contents);
  }
  return {
    algorithm: "directory-sha256-v1",
    sha256: hash.digest("hex"),
    fileCount: files.length,
    byteCount,
  };
}

describe("native WebMCP smoke contract", () => {
  test("uses Chrome's native modelContext for the proof-carrying UI approval flow", async () => {
    const [
      source,
      packageJson,
      evidenceJson,
      screenshotBytes,
      manifestBytes,
      sourceScopeBytes,
    ] = await Promise.all([
      sourceOrEmpty("scripts/native-webmcp-smoke.mjs"),
      sourceOrEmpty("package.json"),
      sourceOrEmpty("docs/assets/native-webmcp-smoke.json"),
      bytesOrEmpty("docs/assets/native-workbench.png"),
      bytesOrEmpty("data/official-assets.lock.json"),
      bytesOrEmpty("data/official-source-scope.json"),
    ]);

    expect(source).toContain('from "playwright"');
    expect(source).not.toMatch(/webmcp-harness|addInitScript|__webMcp/iu);
    expect(source).toContain("--enable-features=WebMCPTesting");
    expect(source.match(/--enable-features=/gu)).toHaveLength(1);
    expect(source).toContain("document.modelContext.getTools()");
    expect(source).toContain("document.modelContext.executeTool(");
    expect(source).toContain("expectedToolNames");
    expect(source).toContain("expectedToolNames.length !== 6");
    expect(source).toMatch(/approve\|apply\|download/iu);
    expect(source).toContain("const agentApprovalTools");
    expect(source).toContain(
      "hasAgentApprovalTool: agentApprovalTools.length > 0",
    );
    expect(source).toContain('performedBy: "playwright-ui-click"');
    expect(source).toContain('target: "approved-draft"');
    expect(source).toContain('target: "pending-proposal"');
    expect(source).toContain(
      'getByRole("button", { name: "Approve changes" })',
    );
    expect(source).toContain("viewport: { width: 1440, height: 1050 }");
    expect(source).toContain("page.screenshot({ fullPage: false })");
    expect(source).toContain("docs/assets/native-webmcp-smoke.json");
    expect(source).toContain("docs/assets/native-workbench.png");
    expect(source).toContain("hashDirectory");
    expect(source).toContain("manifestSha256");
    expect(source).toContain("sourceScopeSha256");
    expect(source).toContain("proposalStatus");
    expect(source).toContain("expectedNodeVersion");
    expect(source).toContain("spawn(");
    expect(source).toContain("const serverClosed = new Promise");
    expect(source).toContain('server.once("close"');
    expect(source).toContain("await waitForServerClose");
    expect(source).not.toContain('once(server, "exit"');
    expect(source).toContain("finally");
    expect(source).toContain("server.kill()");

    const manifest = JSON.parse(packageJson) as {
      scripts?: Record<string, string>;
      engines?: { node?: string };
    };
    expect(manifest.scripts?.["smoke:native"]).toBe(
      "npm run build && node scripts/native-webmcp-smoke.mjs",
    );
    const evidence = JSON.parse(evidenceJson) as {
      schemaVersion: number;
      nodeVersion: string;
      manifestSha256: string;
      sourceScopeSha256: string;
      screenshotSha256: string;
      productionArtifact: {
        algorithm: string;
        sha256: string;
        fileCount: number;
        byteCount: number;
      };
      corpus: { records: number; xml: number; xsd: number; fa3Xml: number };
      selectedAssetId: string;
      documentGeneration: number;
      toolCount: number;
      toolNames: string[];
      hasAgentApprovalTool: boolean;
      proposalPreflight: {
        proposalId: string;
        baseRevision: number;
        contentSha256: string;
      };
      proposalStatus: {
        selectedAssetId: string;
        revision: number;
        documentGeneration: number;
        proposalId: string;
        baseRevision: number;
        proposedSha256: string;
        proof: {
          assetId: string;
          proposalId: string;
          baseRevision: number;
          documentGeneration: number;
          proposedSha256: string;
        };
      };
      approval: { performedBy: string };
      after: { revision: number; pendingProposal: null; draftSha256: string };
      runtimeErrors: string[];
    };
    expect(evidence.schemaVersion).toBe(2);
    expect(evidence.nodeVersion).toBe(`v${manifest.engines?.node}`);
    expect(evidence.manifestSha256).toBe(
      createHash("sha256").update(manifestBytes).digest("hex"),
    );
    expect(evidence.sourceScopeSha256).toBe(
      createHash("sha256").update(sourceScopeBytes).digest("hex"),
    );
    expect(evidence.screenshotSha256).toBe(
      createHash("sha256").update(screenshotBytes).digest("hex"),
    );
    expect(evidence.corpus).toEqual({
      records: 55,
      xml: 45,
      xsd: 10,
      fa3Xml: 44,
    });
    expect(evidence).toMatchObject({
      selectedAssetId: "cirfmf-template-base",
      toolCount: 6,
      hasAgentApprovalTool: false,
      approval: { performedBy: "playwright-ui-click" },
      after: { revision: 1, pendingProposal: null },
      runtimeErrors: [],
    });
    expect(evidence.documentGeneration).toBeGreaterThan(0);
    expect(evidence.toolNames).toEqual([
      "get_workspace_status",
      "list_official_assets",
      "read_official_asset",
      "select_official_asset",
      "stage_exact_replacements",
      "validate_workspace",
    ]);
    expect(evidence.proposalStatus).toMatchObject({
      selectedAssetId: evidence.selectedAssetId,
      revision: evidence.proposalPreflight.baseRevision,
      documentGeneration: evidence.documentGeneration,
      proposalId: evidence.proposalPreflight.proposalId,
      baseRevision: evidence.proposalPreflight.baseRevision,
      proposedSha256: evidence.proposalPreflight.contentSha256,
      proof: {
        assetId: evidence.selectedAssetId,
        proposalId: evidence.proposalPreflight.proposalId,
        baseRevision: evidence.proposalPreflight.baseRevision,
        documentGeneration: evidence.documentGeneration,
        proposedSha256: evidence.proposalPreflight.contentSha256,
      },
    });
    expect(evidence.after.draftSha256).toBe(
      evidence.proposalPreflight.contentSha256,
    );

    const build = spawnSync(
      process.execPath,
      [resolve(root, "node_modules/vite/bin/vite.js"), "build"],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
        env: { ...process.env, NODE_ENV: "production" },
      },
    );
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
    expect(evidence.productionArtifact).toEqual(
      await productionArtifactDigest(resolve(root, "dist")),
    );
  }, 40_000);
});
