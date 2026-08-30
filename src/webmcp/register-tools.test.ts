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
    };
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

    registration.controller?.abort();
    expect(
      registered.every(({ options }) => options?.signal?.aborted === true),
    ).toBe(true);
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
    await modules.webmcp.registerWebMcpTools(store, {
      modelContext,
      loadAssetText: async () => "<NIP>#nip#</NIP>",
      validateCurrent: async () => ({
        valid: false,
        findings: [],
        rawOutput: "invalid",
      }),
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

    expect(parseTextResult(result)).toMatchObject({
      status: "pending-human-approval",
      replacementCount: 1,
    });
    expect(store.getState().draftContent).toBe("<NIP>#nip#</NIP>");
    expect(store.getState().pendingProposal?.proposedContent).toBe(
      "<NIP>1111111111</NIP>",
    );
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
