import { describe, expect, test } from "vitest";

import type { ValidationResult } from "../validation/types";

type Registered = {
  tool: WebMCP.ModelContextTool;
  options?: WebMCP.ModelContextRegisterToolOptions;
};

type WebMcpModule = {
  registerWebMcpTools(
    store: unknown,
    dependencies: {
      modelContext?: Pick<WebMCP.ModelContext, "registerTool">;
      loadAssetText(id: string): Promise<string>;
      validateCurrent(
        content: string,
        fileName: string,
        signal: AbortSignal,
      ): Promise<ValidationResult>;
    },
  ): Promise<{ supported: boolean; controller: AbortController | null }>;
};

type StoreModule = {
  createWorkspaceStore(options?: {
    canStageReplacements?: (assetId: string) => boolean;
  }): {
    getState(): {
      draftContent: string | null;
      pendingProposal: null | { proposedContent: string };
      proposalValidation: null | {
        proposedSha256: string;
        result: ValidationResult;
      };
    };
    approveProposal(proposalId: string): void;
  };
};

async function loadModules(): Promise<{
  webmcp: WebMcpModule;
  store: StoreModule;
} | null> {
  try {
    return {
      webmcp: (await import("./register-tools")) as WebMcpModule,
      store: (await import("../workspace/store")) as StoreModule,
    };
  } catch {
    return null;
  }
}

function parseTextResult(result: unknown): unknown {
  const output = result as { content: Array<{ type: string; text: string }> };
  expect(output.content[0]?.type).toBe("text");
  return JSON.parse(output.content[0]?.text ?? "null");
}

describe("WebMCP registration", () => {
  test("registers exactly six bounded tools and unregisters them together", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const registered: Registered[] = [];
    const modelContext = {
      async registerTool(
        tool: WebMCP.ModelContextTool,
        options?: WebMCP.ModelContextRegisterToolOptions,
      ) {
        registered.push({ tool, ...(options ? { options } : {}) });
      },
    };
    const store = modules.store.createWorkspaceStore();
    const registration = await modules.webmcp.registerWebMcpTools(store, {
      modelContext,
      loadAssetText: async () => "<NIP>#nip#</NIP>",
      validateCurrent: async () => ({
        valid: false,
        findings: [],
        rawOutput: "invalid",
      }),
    });

    expect(registration.supported).toBe(true);
    expect(registered.map(({ tool }) => tool.name)).toEqual([
      "list_official_assets",
      "read_official_asset",
      "select_official_asset",
      "validate_workspace",
      "stage_exact_replacements",
      "get_workspace_status",
    ]);
    expect(registered.some(({ tool }) => tool.name.includes("approve"))).toBe(
      false,
    );
    expect(
      registered.find(({ tool }) => tool.name === "list_official_assets")?.tool
        .annotations?.readOnlyHint,
    ).toBe(true);
    expect(
      registered.find(({ tool }) => tool.name === "validate_workspace")?.tool
        .annotations?.readOnlyHint,
    ).toBe(false);
    for (const toolName of [
      "select_official_asset",
      "stage_exact_replacements",
    ]) {
      expect(
        registered.find(({ tool }) => tool.name === toolName)?.tool.annotations
          ?.readOnlyHint,
        toolName,
      ).toBe(false);
    }
    expect(
      registered.find(({ tool }) => tool.name === "validate_workspace")?.tool
        .annotations?.untrustedContentHint,
    ).toBe(true);

    const catalogResult = await registered
      .find(({ tool }) => tool.name === "list_official_assets")
      ?.tool.execute({}, { signal: new AbortController().signal });
    const catalog = parseTextResult(catalogResult) as {
      total: number;
      returned: number;
      offset: number;
      limit: number;
      hasMore: boolean;
      nextOffset: number | null;
      assets: unknown[];
    };
    expect(catalog).toMatchObject({
      total: 55,
      returned: 6,
      offset: 0,
      limit: 6,
      hasMore: true,
      nextOffset: 6,
    });
    expect(catalog.assets).toHaveLength(6);
    const catalogText = (
      catalogResult as {
        content: Array<{ text: string }>;
      }
    ).content[0]?.text;
    expect(catalogText?.length).toBeLessThanOrEqual(1500);

    const finalPage = parseTextResult(
      await registered
        .find(({ tool }) => tool.name === "list_official_assets")
        ?.tool.execute(
          { offset: 54, limit: 6 },
          { signal: new AbortController().signal },
        ),
    ) as typeof catalog;
    expect(finalPage).toMatchObject({
      total: 55,
      returned: 1,
      offset: 54,
      hasMore: false,
      nextOffset: null,
    });

    registration.controller?.abort();
    expect(
      registered.every(({ options }) => options?.signal?.aborted === true),
    ).toBe(true);
  });

  test("accepts native callbacks without an options object", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    let validationSignal: AbortSignal | null = null;
    const store = modules.store.createWorkspaceStore();
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
      loadAssetText: async () => "<Faktura><NIP>#nip#</NIP></Faktura>",
      validateCurrent: async (_content, _fileName, signal) => {
        validationSignal = signal;
        return { valid: false, findings: [], rawOutput: "invalid" };
      },
    });
    const signal = new AbortController().signal;
    await tools
      .get("select_official_asset")
      ?.execute({ assetId: "cirfmf-template-base" }, { signal });

    const nativeExecute = tools.get("validate_workspace")?.execute as
      ((input: Record<string, unknown>) => unknown) | undefined;
    const result = await nativeExecute?.({});

    expect(validationSignal).toBeInstanceOf(AbortSignal);
    expect(parseTextResult(result)).toMatchObject({
      target: "approved-draft",
      valid: false,
      revision: 0,
    });
  });

  test("returns bounded official source excerpts with an explicit continuation", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const source = Array.from(
      { length: 50 },
      (_, index) => `<Line>${index + 1}</Line>`,
    ).join("\n");
    await modules.webmcp.registerWebMcpTools(
      modules.store.createWorkspaceStore(),
      {
        modelContext: {
          async registerTool(tool: WebMCP.ModelContextTool) {
            tools.set(tool.name, tool);
          },
        },
        loadAssetText: async () => source,
        validateCurrent: async () => ({
          valid: true,
          findings: [],
          rawOutput: "",
        }),
      },
    );

    const result = await tools
      .get("read_official_asset")
      ?.execute(
        { assetId: "cirfmf-template-base" },
        { signal: new AbortController().signal },
      );
    const excerpt = parseTextResult(result) as {
      range: {
        startLine: number;
        endLine: number;
        totalLines: number;
      };
      truncated: boolean;
      nextLine: number | null;
      nextColumn: number | null;
      source: string;
    };

    expect(excerpt.range).toEqual({
      startLine: 1,
      endLine: 20,
      totalLines: 50,
    });
    expect(excerpt.truncated).toBe(true);
    expect(excerpt.nextLine).toBe(21);
    expect(excerpt.nextColumn).toBe(0);
    expect(
      (result as { content: Array<{ text: string }> }).content[0]?.text.length,
    ).toBeLessThanOrEqual(1500);
  });

  test("continues inside a long line without exceeding the serialized budget", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const source = `<Root attr="${"😀".repeat(1_100)}"/>`;
    await modules.webmcp.registerWebMcpTools(
      modules.store.createWorkspaceStore(),
      {
        modelContext: {
          async registerTool(tool: WebMCP.ModelContextTool) {
            tools.set(tool.name, tool);
          },
        },
        loadAssetText: async () => source,
        validateCurrent: async () => ({
          valid: true,
          findings: [],
          rawOutput: "",
        }),
      },
    );

    const firstResult = await tools
      .get("read_official_asset")
      ?.execute(
        { assetId: "cirfmf-template-base" },
        { signal: new AbortController().signal },
      );
    const first = parseTextResult(firstResult) as {
      truncated: boolean;
      nextLine: number | null;
      nextColumn: number | null;
      source: string;
    };
    expect(
      (firstResult as { content: Array<{ text: string }> }).content[0]?.text
        .length,
    ).toBeLessThanOrEqual(1500);
    expect(first.truncated).toBe(true);
    expect(first.nextLine).toBe(1);
    expect(first.nextColumn).toBeGreaterThan(0);
    expect(first.source).toBe(source.slice(0, first.nextColumn ?? 0));

    const secondResult = await tools.get("read_official_asset")?.execute(
      {
        assetId: "cirfmf-template-base",
        startLine: first.nextLine,
        startColumn: first.nextColumn,
      },
      { signal: new AbortController().signal },
    );
    const second = parseTextResult(secondResult) as { source: string };
    expect(second.source).toBe(
      source.slice(
        first.nextColumn ?? 0,
        (first.nextColumn ?? 0) + second.source.length,
      ),
    );
    expect(
      (secondResult as { content: Array<{ text: string }> }).content[0]?.text
        .length,
    ).toBeLessThanOrEqual(1500);
  });

  test("aborts every registration signal after a partial registration failure", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const registrations: Registered[] = [];
    const unregistered = new Set<string>();
    await expect(
      modules.webmcp.registerWebMcpTools(modules.store.createWorkspaceStore(), {
        modelContext: {
          async registerTool(tool, options) {
            registrations.push({ tool, ...(options ? { options } : {}) });
            options?.signal?.addEventListener(
              "abort",
              () => unregistered.add(tool.name),
              { once: true },
            );
            if (tool.name === "validate_workspace") {
              throw new Error("registration failed");
            }
          },
        },
        loadAssetText: async () => "",
        validateCurrent: async () => ({
          valid: true,
          findings: [],
          rawOutput: "",
        }),
      }),
    ).rejects.toThrow("registration failed");

    expect(registrations).toHaveLength(6);
    expect(
      registrations.every(({ options }) => options?.signal?.aborted === true),
    ).toBe(true);
    expect([...unregistered].sort()).toEqual(
      registrations.map(({ tool }) => tool.name).sort(),
    );
  });

  test("stages agent replacements without changing the approved draft", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const modelContext = {
      async registerTool(tool: WebMCP.ModelContextTool) {
        tools.set(tool.name, tool);
      },
    };
    const store = modules.store.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    let validatedContent: string | null = null;
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext,
      loadAssetText: async () => "<NIP>#nip#</NIP>",
      validateCurrent: async (content) => {
        validatedContent = content;
        return {
          valid: !content.includes("#"),
          findings: [],
          rawOutput: content.includes("#") ? "invalid" : "valid",
        };
      },
    });
    const signal = new AbortController().signal;

    await tools
      .get("select_official_asset")
      ?.execute({ assetId: "cirfmf-template-base" }, { signal });
    const result = await tools.get("stage_exact_replacements")?.execute(
      {
        summary: "Fill NIP",
        replacements: [
          {
            search: "#nip#",
            replacement: "1111111111",
            reason: "Schema-compatible value",
          },
        ],
      },
      { signal },
    );

    const staged = parseTextResult(result) as {
      proposalId: string;
      status: string;
      replacementCount: number;
    };
    expect(staged).toMatchObject({
      status: "pending-human-approval",
      replacementCount: 1,
    });
    expect(store.getState().draftContent).toBe("<NIP>#nip#</NIP>");
    expect(store.getState().pendingProposal?.proposedContent).toBe(
      "<NIP>1111111111</NIP>",
    );
    expect(() => store.approveProposal(staged.proposalId)).toThrow(
      "Proposal requires a current valid preflight",
    );

    const preflightResult = await tools
      .get("validate_workspace")
      ?.execute({ target: "pending-proposal" }, { signal });
    const preflight = parseTextResult(preflightResult) as {
      target: string;
      proposalId: string;
      valid: boolean;
      contentSha256: string;
    };
    expect(validatedContent).toBe("<NIP>1111111111</NIP>");
    expect(preflight).toMatchObject({
      target: "pending-proposal",
      proposalId: staged.proposalId,
      valid: true,
    });
    expect(preflight.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(store.getState().proposalValidation).toMatchObject({
      proposedSha256: preflight.contentSha256,
      result: { valid: true },
    });

    store.approveProposal(staged.proposalId);
    expect(store.getState().draftContent).toBe("<NIP>1111111111</NIP>");
  });

  test("refuses to stage replacements against an XSD source", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const store = modules.store.createWorkspaceStore();
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
      loadAssetText: async () => "<schema>#value#</schema>",
      validateCurrent: async () => ({
        valid: true,
        findings: [],
        rawOutput: "",
      }),
    });
    const signal = new AbortController().signal;
    await tools
      .get("select_official_asset")
      ?.execute({ assetId: "crd-fa3-schema" }, { signal });

    expect(() =>
      tools.get("stage_exact_replacements")?.execute(
        {
          summary: "Do not allow schema edits",
          replacements: [
            {
              search: "#value#",
              replacement: "changed",
              reason: "Attempted XSD edit",
            },
          ],
        },
        { signal },
      ),
    ).toThrow("not an FA(3) XML document");
    expect(store.getState().pendingProposal).toBeNull();
  });

  test("reports unsupported without registering a fake production API", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const result = await modules.webmcp.registerWebMcpTools(
      modules.store.createWorkspaceStore(),
      {
        loadAssetText: async () => "",
        validateCurrent: async () => ({
          valid: true,
          findings: [],
          rawOutput: "",
        }),
      },
    );

    expect(result).toEqual({ supported: false, controller: null });
  });
});
