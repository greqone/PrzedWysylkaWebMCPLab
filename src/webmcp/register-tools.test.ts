import { describe, expect, test } from "vitest";

import type { ValidationResult } from "../validation/types";

type Registered = {
  tool: WebMCP.ModelContextTool;
  options?: WebMCP.ModelContextRegisterToolOptions;
};

type SchemaNode = {
  maxLength?: number;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
};

type WebMcpModule = {
  registerWebMcpTools(
    store: unknown,
    dependencies: {
      modelContext?: Pick<WebMCP.ModelContext, "registerTool">;
      loadAssetText(id: string, signal?: AbortSignal): Promise<string>;
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
    createId?: () => string;
    now?: () => string;
  }): {
    getState(): {
      selectedAssetId: string | null;
      draftContent: string | null;
      pendingAssetSelection: null | { assetId: string };
      pendingValidation: null | { target: string };
      pendingProposal: null | { proposedContent: string; summary: string };
      validation: ValidationResult | null;
      proposalValidation: null | {
        proposedSha256: string;
        result: ValidationResult;
      };
      history: Array<{ type: string }>;
    };
    approveProposal(proposalId: string): void;
    rejectProposal(proposalId: string): void;
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
    const schemas = new Map(
      registered.map(({ tool }) => [tool.name, tool.inputSchema as SchemaNode]),
    );
    expect(schemas.get("list_official_assets")?.properties?.role).toMatchObject(
      {
        maxLength: 80,
      },
    );
    expect(
      schemas.get("list_official_assets")?.properties?.search,
    ).toMatchObject({ maxLength: 200 });
    expect(
      schemas.get("read_official_asset")?.properties?.assetId,
    ).toMatchObject({ maxLength: 128 });
    expect(
      schemas.get("select_official_asset")?.properties?.assetId,
    ).toMatchObject({ maxLength: 128 });
    const replacementItem = schemas.get("stage_exact_replacements")?.properties
      ?.replacements?.items;
    expect(replacementItem?.properties?.search?.maxLength).toBe(20_000);
    expect(replacementItem?.properties?.replacement?.maxLength).toBe(100_000);
    expect(replacementItem?.properties?.reason?.maxLength).toBe(500);
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

    let nextCatalogOffset: number | null = 0;
    let finalPage: typeof catalog | null = null;
    while (nextCatalogOffset !== null) {
      const pageResult = await registered
        .find(({ tool }) => tool.name === "list_official_assets")
        ?.tool.execute(
          { offset: nextCatalogOffset, limit: 6 },
          { signal: new AbortController().signal },
        );
      const pageText = (
        pageResult as {
          content: Array<{ text: string }>;
        }
      ).content[0]?.text;
      expect(pageText?.length).toBeLessThanOrEqual(1_500);
      finalPage = parseTextResult(pageResult) as typeof catalog;
      nextCatalogOffset = finalPage.nextOffset;
    }
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

  test("does not commit an asset selection aborted during its load", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const pendingLoad = deferred<string>();
    let receivedSignal: AbortSignal | undefined;
    const store = modules.store.createWorkspaceStore();
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
      loadAssetText: async (_id, signal) => {
        receivedSignal = signal;
        return pendingLoad.promise;
      },
      validateCurrent: async () => ({
        valid: true,
        findings: [],
        rawOutput: "",
      }),
    });
    const controller = new AbortController();
    const selection = tools
      .get("select_official_asset")
      ?.execute(
        { assetId: "cirfmf-template-base" },
        { signal: controller.signal },
      );
    const rejectedSelection = expect(selection).rejects.toMatchObject({
      name: "AbortError",
    });

    await Promise.resolve();
    expect(store.getState().pendingAssetSelection?.assetId).toBe(
      "cirfmf-template-base",
    );
    controller.abort(new DOMException("Selection aborted", "AbortError"));
    pendingLoad.resolve("<Faktura/>");

    await rejectedSelection;
    expect(receivedSignal).toBe(controller.signal);
    expect(store.getState()).toMatchObject({
      selectedAssetId: null,
      pendingAssetSelection: null,
      draftContent: null,
    });
  });

  test("cancels validation state when a dependency ignores abort", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const pendingValidation = deferred<ValidationResult>();
    let receivedSignal: AbortSignal | undefined;
    const store = modules.store.createWorkspaceStore();
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
      loadAssetText: async () => "<Faktura/>",
      validateCurrent: async (_content, _fileName, signal) => {
        receivedSignal = signal;
        return pendingValidation.promise;
      },
    });
    const selectSignal = new AbortController().signal;
    await tools
      .get("select_official_asset")
      ?.execute({ assetId: "cirfmf-template-base" }, { signal: selectSignal });
    const controller = new AbortController();
    const validation = tools
      .get("validate_workspace")
      ?.execute({}, { signal: controller.signal });
    const validationOutcome = Promise.resolve(validation).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );

    await Promise.resolve();
    expect(store.getState().pendingValidation?.target).toBe("approved-draft");
    controller.abort(new DOMException("Validation aborted", "AbortError"));
    const pendingAfterAbort = store.getState().pendingValidation;
    pendingValidation.resolve({ valid: true, findings: [], rawOutput: "" });

    const outcome = await validationOutcome;
    expect(pendingAfterAbort).toBeNull();
    expect(outcome).toMatchObject({
      status: "rejected",
      error: { name: "AbortError" },
    });
    expect(receivedSignal).toBe(controller.signal);
    expect(store.getState().validation).toBeNull();
    expect(
      store
        .getState()
        .history.some((entry) => entry.type === "validation-completed"),
    ).toBe(false);
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

  test("round-trips mixed line endings through cursors and stages copied text exactly", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const source = `<Root>\r\n  <A>${"😀".repeat(900)}</A>\r  <B>#nip#</B>\n</Root>`;
    const tools = new Map<string, WebMCP.ModelContextTool>();
    const store = modules.store.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    await modules.webmcp.registerWebMcpTools(store, {
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
    });
    const signal = new AbortController().signal;
    await tools
      .get("select_official_asset")
      ?.execute({ assetId: "cirfmf-template-base" }, { signal });

    let nextLine: number | null = 1;
    let nextColumn: number | null = 0;
    let reconstructed = "";
    for (let page = 0; nextLine !== null && page < 20; page += 1) {
      const result = await tools.get("read_official_asset")?.execute(
        {
          assetId: "cirfmf-template-base",
          startLine: nextLine,
          startColumn: nextColumn,
          lineCount: 2,
        },
        { signal },
      );
      const text = (result as { content: Array<{ text: string }> }).content[0]
        ?.text;
      expect(text?.length).toBeLessThanOrEqual(1_500);
      const payload = parseTextResult(result) as {
        source: string;
        nextLine: number | null;
        nextColumn: number | null;
      };
      reconstructed += payload.source;
      nextLine = payload.nextLine;
      nextColumn = payload.nextColumn;
    }

    expect(nextLine).toBeNull();
    expect(reconstructed).toBe(source);
    const copiedSearch = reconstructed.slice(
      reconstructed.indexOf("</A>"),
      reconstructed.indexOf("</B>") + "</B>".length,
    );
    const staged = await tools.get("stage_exact_replacements")?.execute(
      {
        summary: "Replace the exact mixed-newline excerpt",
        replacements: [
          {
            search: copiedSearch,
            replacement: "</A>\r  <B>1111111111</B>",
            reason: "Prove read-to-stage fidelity",
          },
        ],
      },
      { signal },
    );
    expect(parseTextResult(staged)).toMatchObject({
      status: "pending-human-approval",
      replacementCount: 1,
    });
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

    const status = parseTextResult(
      await tools.get("get_workspace_status")?.execute({}, { signal }),
    ) as {
      documentGeneration: number;
      pendingProposal: {
        id: string;
        baseRevision: number;
        proposedSha256: string;
        validation: {
          assetId: string;
          proposalId: string;
          baseRevision: number;
          documentGeneration: number;
          proposedSha256: string;
        };
      };
    };
    expect(status).toMatchObject({
      documentGeneration: 1,
      pendingProposal: {
        id: staged.proposalId,
        baseRevision: 0,
        proposedSha256: preflight.contentSha256,
        validation: {
          assetId: "cirfmf-template-base",
          proposalId: staged.proposalId,
          baseRevision: 0,
          documentGeneration: 1,
          proposedSha256: preflight.contentSha256,
        },
      },
    });

    store.approveProposal(staged.proposalId);
    expect(store.getState().draftContent).toBe("<NIP>1111111111</NIP>");
  });

  test("bounds long validation diagnostics without silently dropping detail", async () => {
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
      loadAssetText: async () => "<NIP>#nip#</NIP>",
      validateCurrent: async () => ({
        valid: false,
        findings: [
          {
            fileName: "f".repeat(500),
            line: 1,
            message: "😀".repeat(8_000),
            raw: "raw".repeat(8_000),
          },
        ],
        rawOutput: "raw".repeat(8_000),
      }),
    });
    const signal = new AbortController().signal;
    await tools
      .get("select_official_asset")
      ?.execute({ assetId: "cirfmf-template-base" }, { signal });

    const result = await tools
      .get("validate_workspace")
      ?.execute({}, { signal });
    const text = (result as { content: Array<{ text: string }> }).content[0]
      ?.text;
    expect(text?.length).toBeLessThanOrEqual(1_500);
    const payload = parseTextResult(result) as {
      findingCount: number;
      returnedFindings: number;
      truncated: boolean;
      findingTextTruncated: boolean;
      findings: Array<{
        fileName: string | null;
        fileNameTruncated: boolean;
        message: string;
        messageTruncated: boolean;
        raw?: string;
      }>;
    };
    expect(payload).toMatchObject({
      findingCount: 1,
      returnedFindings: 1,
      truncated: true,
      findingTextTruncated: true,
    });
    expect(payload.findings[0]?.messageTruncated).toBe(true);
    expect(payload.findings[0]?.fileNameTruncated).toBe(true);
    expect(payload.findings[0]?.message).not.toMatch(/[\uD800-\uDBFF]$/u);
    expect(payload.findings[0]).not.toHaveProperty("raw");
  });

  test("bounds escaped proposal summaries without failing after staging", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const store = modules.store.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
      loadAssetText: async () => "<NIP>#nip#</NIP>",
      validateCurrent: async () => ({
        valid: false,
        findings: [],
        rawOutput: "",
      }),
    });
    const signal = new AbortController().signal;
    await tools
      .get("select_official_asset")
      ?.execute({ assetId: "cirfmf-template-base" }, { signal });
    const summary = "\0\uD800".repeat(250);

    const stagedResult = await tools.get("stage_exact_replacements")?.execute(
      {
        summary,
        replacements: [
          {
            search: "#nip#",
            replacement: "1111111111",
            reason: "Escaped summary budget regression",
          },
        ],
      },
      { signal },
    );
    const stagedText = (stagedResult as { content: Array<{ text: string }> })
      .content[0]?.text;
    expect(stagedText?.length).toBeLessThanOrEqual(1_500);
    const staged = parseTextResult(stagedResult) as {
      summary: string;
      summaryTruncated: boolean;
    };
    expect(staged.summaryTruncated).toBe(true);
    expect(staged.summary.length).toBeLessThan(summary.length);
    expect(store.getState().pendingProposal?.summary).toBe(summary);
  });

  test("bounds adversarial proposal and history summaries with explicit metadata", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const store = modules.store.createWorkspaceStore({
      canStageReplacements: () => true,
    });
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
      loadAssetText: async () => "<NIP>#nip#</NIP>",
      validateCurrent: async () => ({
        valid: false,
        findings: [],
        rawOutput: "",
      }),
    });
    const signal = new AbortController().signal;
    const selected = await tools
      .get("select_official_asset")
      ?.execute({ assetId: "cirfmf-template-base" }, { signal });
    expect(
      (selected as { content: Array<{ text: string }> }).content[0]?.text
        .length,
    ).toBeLessThanOrEqual(1_500);

    for (let index = 0; index < 4; index += 1) {
      const stagedResult = await tools.get("stage_exact_replacements")?.execute(
        {
          summary: `${index}${"s".repeat(499)}`,
          replacements: [
            {
              search: "#nip#",
              replacement: "1111111111",
              reason: "Budget regression",
            },
          ],
        },
        { signal },
      );
      expect(
        (stagedResult as { content: Array<{ text: string }> }).content[0]?.text
          .length,
      ).toBeLessThanOrEqual(1_500);
      const staged = parseTextResult(stagedResult) as { proposalId: string };
      store.rejectProposal(staged.proposalId);
    }

    await tools.get("stage_exact_replacements")?.execute(
      {
        summary: "p".repeat(500),
        replacements: [
          {
            search: "#nip#",
            replacement: "1111111111",
            reason: "Pending summary budget regression",
          },
        ],
      },
      { signal },
    );

    const statusResult = await tools
      .get("get_workspace_status")
      ?.execute({}, { signal });
    const statusText = (statusResult as { content: Array<{ text: string }> })
      .content[0]?.text;
    expect(statusText?.length).toBeLessThanOrEqual(1_500);
    const status = parseTextResult(statusResult) as {
      historyTotal: number;
      historyReturned: number;
      historyHasMore: boolean;
      historySummariesTruncated: boolean;
      pendingProposal: { summaryTruncated: boolean } | null;
      history: Array<{ summary: string; summaryTruncated: boolean }>;
    };
    expect(status.historyTotal).toBe(10);
    expect(status.historyReturned).toBe(status.history.length);
    expect(status.historyHasMore).toBe(true);
    expect(status.historySummariesTruncated).toBe(true);
    expect(status.pendingProposal?.summaryTruncated).toBe(true);
    expect(status.history.some((entry) => entry.summaryTruncated)).toBe(true);
  });

  test("omits history when no history entry fits the status budget", async () => {
    const modules = await loadModules();
    expect(modules, "WebMCP and store modules must exist").not.toBeNull();
    if (!modules) return;

    const tools = new Map<string, WebMCP.ModelContextTool>();
    const store = modules.store.createWorkspaceStore({
      createId: () => "event".repeat(200),
      now: () => "timestamp".repeat(125),
    });
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext: {
        async registerTool(tool: WebMCP.ModelContextTool) {
          tools.set(tool.name, tool);
        },
      },
      loadAssetText: async () => "<NIP>#nip#</NIP>",
      validateCurrent: async () => ({
        valid: false,
        findings: [],
        rawOutput: "",
      }),
    });
    const signal = new AbortController().signal;
    await tools
      .get("select_official_asset")
      ?.execute({ assetId: "cirfmf-template-base" }, { signal });

    const statusResult = await tools
      .get("get_workspace_status")
      ?.execute({}, { signal });
    const statusText = (statusResult as { content: Array<{ text: string }> })
      .content[0]?.text;
    expect(statusText?.length).toBeLessThanOrEqual(1_500);
    expect(parseTextResult(statusResult)).toMatchObject({
      historyTotal: 1,
      historyReturned: 0,
      historyHasMore: true,
      historySummariesTruncated: false,
      history: [],
    });
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
