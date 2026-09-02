import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

async function sourceOrEmpty(path: string) {
  return readFile(resolve(root, path), "utf8").catch(() => "");
}

describe("native WebMCP smoke contract", () => {
  test("uses Chrome's native modelContext for the proof-carrying human approval flow", async () => {
    const [source, packageJson, evidenceJson] = await Promise.all([
      sourceOrEmpty("scripts/native-webmcp-smoke.mjs"),
      sourceOrEmpty("package.json"),
      sourceOrEmpty("docs/assets/native-webmcp-smoke.json"),
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
    expect(source).toContain("spawn(");
    expect(source).toContain("const serverClosed = new Promise");
    expect(source).toContain('server.once("close"');
    expect(source).toContain("await waitForServerClose");
    expect(source).not.toContain('once(server, "exit"');
    expect(source).toContain("finally");
    expect(source).toContain("server.kill()");

    const manifest = JSON.parse(packageJson) as {
      scripts?: Record<string, string>;
    };
    expect(manifest.scripts?.["smoke:native"]).toBe(
      "npm run build && node scripts/native-webmcp-smoke.mjs",
    );
    const evidence = JSON.parse(evidenceJson) as {
      approval?: { performedBy?: string };
    };
    expect(evidence.approval?.performedBy).toBe("playwright-ui-click");
  });
});
