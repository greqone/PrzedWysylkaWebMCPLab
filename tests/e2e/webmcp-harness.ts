import type { Page } from "@playwright/test";

export async function installWebMcpHarness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class HarnessModelContext extends EventTarget {
      readonly tools = new Map<
        string,
        {
          name: string;
          title?: string;
          description: string;
          inputSchema?: object;
          annotations?: object;
          execute(
            input: Record<string, unknown>,
            options: { signal: AbortSignal },
          ): unknown;
        }
      >();

      async registerTool(
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema?: object;
          annotations?: object;
          execute(
            input: Record<string, unknown>,
            options: { signal: AbortSignal },
          ): unknown;
        },
        options?: { signal?: AbortSignal },
      ): Promise<void> {
        if (this.tools.has(tool.name)) {
          throw new Error(`Duplicate WebMCP tool: ${tool.name}`);
        }
        this.tools.set(tool.name, tool);
        options?.signal?.addEventListener(
          "abort",
          () => {
            this.tools.delete(tool.name);
            this.dispatchEvent(new Event("toolchange"));
          },
          { once: true },
        );
        this.dispatchEvent(new Event("toolchange"));
      }

      async getTools(): Promise<unknown[]> {
        return [...this.tools.values()].map((tool) => ({
          ...tool,
          origin: location.origin,
          window,
        }));
      }

      async executeTool(
        registered: { name: string },
        input: Record<string, unknown>,
      ): Promise<unknown> {
        const tool = this.tools.get(registered.name);
        if (!tool) throw new Error(`Unknown WebMCP tool: ${registered.name}`);
        return tool.execute(input, { signal: new AbortController().signal });
      }
    }

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: new HarnessModelContext(),
    });
  });
}

export async function executeWebMcpTool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown>,
): Promise<T> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const modelContext = document.modelContext;
      if (!modelContext) throw new Error("WebMCP harness is missing");
      const tools = await modelContext.getTools();
      const tool = tools.find((candidate) => candidate.name === toolName);
      if (!tool) throw new Error(`Tool is not registered: ${toolName}`);
      const result = (await (
        modelContext as WebMCP.ModelContext & {
          executeTool(
            tool: WebMCP.RegisteredTool,
            input: Record<string, unknown>,
          ): Promise<unknown>;
        }
      ).executeTool(tool, toolInput)) as {
        content: Array<{ type: "text"; text: string }>;
      };
      return JSON.parse(result.content[0]?.text ?? "null") as T;
    },
    { toolName: name, toolInput: input },
  );
}
