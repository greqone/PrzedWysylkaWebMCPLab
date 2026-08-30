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
  createWorkspaceStore(): {
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

    registration.controller?.abort();
    expect(
      registered.every(({ options }) => options?.signal?.aborted === true),
    ).toBe(true);
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
    const store = modules.store.createWorkspaceStore();
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
