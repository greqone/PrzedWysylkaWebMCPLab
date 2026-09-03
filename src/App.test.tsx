// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ValidationResult } from "./validation/types";
import { createWorkspaceStore } from "./workspace/store";
import type { WorkspaceStore } from "./workspace/types";

afterEach(() => cleanup());

type AppDependencies = {
  store: WorkspaceStore;
  loadAssetText(id: string, signal?: AbortSignal): Promise<string>;
  validateCurrent(
    content: string,
    fileName: string,
    signal: AbortSignal,
  ): Promise<ValidationResult>;
  registerTools(): Promise<{
    supported: boolean;
    controller: AbortController | null;
  }>;
};

type AppModule = {
  App: ComponentType<{ dependencies?: AppDependencies }>;
};

async function loadApp(): Promise<AppModule | null> {
  const modulePath = "./App";
  return import(/* @vite-ignore */ modulePath).catch(
    () => null,
  ) as Promise<AppModule | null>;
}

function createDependencies(supported = false): AppDependencies {
  let id = 0;
  const store = createWorkspaceStore({
    now: () => "2026-08-30T18:00:00.000Z",
    createId: () => `ui-event-${++id}`,
    canStageReplacements: (assetId) => assetId === "cirfmf-template-base",
    hashContent: async () => "a".repeat(64),
  });
  return {
    store,
    loadAssetText: async (assetId) =>
      assetId === "cirfmf-template-base"
        ? "<Faktura>\n  <NIP>#nip#</NIP>\n  <P_2>#invoice_number#</P_2>\n</Faktura>"
        : "<Faktura/>",
    validateCurrent: async (content) =>
      content.includes("#")
        ? {
            valid: false,
            findings: [
              {
                fileName: "fixture.xml",
                line: 2,
                message: "Template placeholder is not schema-valid.",
                raw: "invalid",
              },
            ],
            rawOutput: "invalid",
          }
        : { valid: true, findings: [], rawOutput: "" },
    registerTools: async () => ({ supported, controller: null }),
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("FA(3) workbench", () => {
  test("supports the advertised slash shortcut and a visible selected cue", async () => {
    const module = await loadApp();
    expect(module, "App module must exist").not.toBeNull();
    if (!module) return;

    const user = userEvent.setup();
    render(<module.App dependencies={createDependencies()} />);
    await waitFor(() =>
      expect(screen.getByTestId("source-code").textContent).toContain("#nip#"),
    );
    const search = screen.getByRole("searchbox", {
      name: "Search official assets",
    }) as HTMLInputElement;
    expect(
      document.querySelector(".asset-item.is-selected .asset-chevron")
        ?.textContent,
    ).toBe("✓");
    expect(document.activeElement).not.toBe(search);

    await user.keyboard("/");
    expect(document.activeElement).toBe(search);
    await user.type(search, "CIRFMF");
    await user.keyboard("/");
    expect(search.value).toBe("CIRFMF/");

    search.blur();
    fireEvent.keyDown(document, { key: "/", ctrlKey: true });
    expect(document.activeElement).not.toBe(search);
  });

  test("keeps an agent proposal pending until human approval and revalidation", async () => {
    const module = await loadApp();
    expect(module, "App module must exist").not.toBeNull();
    if (!module) return;

    const user = userEvent.setup();
    render(<module.App dependencies={createDependencies()} />);

    await waitFor(() =>
      expect(screen.getByTestId("source-code").textContent).toContain("#nip#"),
    );
    expect(screen.getByText(/Official assets frozen 2026-09-02/u)).toBeTruthy();
    expect(screen.getByText("WebMCP unavailable")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Validate XML" }));
    expect(
      screen.getByRole("heading", { name: "Current approved revision" }),
    ).toBeTruthy();
    expect(await screen.findByText("Needs attention")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Manual demo fallback" }),
    );
    expect(await screen.findByText("Pending human approval")).toBeTruthy();
    expect(screen.getByTestId("source-code").textContent).toContain("#nip#");

    const approve = screen.getByRole("button", { name: "Approve changes" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Validate proposed change" }),
    );
    expect(
      await screen.findByText("Schema valid before approval"),
    ).toBeTruthy();
    expect((approve as HTMLButtonElement).disabled).toBe(false);

    await user.click(approve);
    await waitFor(() =>
      expect(screen.getByTestId("source-code").textContent).not.toContain(
        "#nip#",
      ),
    );
    expect(screen.getByTestId("source-code").textContent).toContain(
      "FV/2026/001",
    );

    expect(await screen.findByText("Schema valid")).toBeTruthy();
  });

  test("lets the human reject a proposal without changing the draft", async () => {
    const module = await loadApp();
    expect(module, "App module must exist").not.toBeNull();
    if (!module) return;

    const user = userEvent.setup();
    render(<module.App dependencies={createDependencies()} />);
    await waitFor(() =>
      expect(screen.getByTestId("source-code").textContent).toContain("#nip#"),
    );

    await user.click(
      screen.getByRole("button", { name: "Manual demo fallback" }),
    );
    await user.click(screen.getByRole("button", { name: "Reject proposal" }));

    expect(screen.queryByText("Pending human approval")).toBeNull();
    expect(screen.getByTestId("source-code").textContent).toContain("#nip#");
  });

  test("requires agent preflight in connected mode and copies the exact prompt", async () => {
    const module = await loadApp();
    expect(module, "App module must exist").not.toBeNull();
    if (!module) return;

    const dependencies = createDependencies(true);
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<module.App dependencies={dependencies} />);
    await screen.findByText("6 WebMCP tools live");
    expect(
      screen.queryByRole("button", { name: "Manual demo fallback" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));
    expect(writeText).toHaveBeenCalledWith(
      "Open the base FA(3) template, validate it, then stage exact replacements for its two placeholders. Validate the pending proposal, but do not approve it.",
    );

    await act(async () => {
      dependencies.store.stageProposal({
        summary: "Agent proposal",
        replacements: [
          { search: "#nip#", replacement: "1111111111", reason: "Valid NIP" },
          {
            search: "#invoice_number#",
            replacement: "FV/2026/001",
            reason: "Valid invoice number",
          },
        ],
      });
    });
    expect(await screen.findByText("Waiting for agent preflight")).toBeTruthy();
    const approve = screen.getByRole("button", { name: "Approve changes" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      const context = dependencies.store.startValidation("pending-proposal");
      await dependencies.store.recordValidation(
        { valid: true, findings: [], rawOutput: "valid" },
        context,
      );
    });
    expect(
      await screen.findByText("Schema valid before approval"),
    ).toBeTruthy();
    expect(screen.getByText(/aaaaaaaaaaaa/u)).toBeTruthy();
    expect((approve as HTMLButtonElement).disabled).toBe(false);
  });

  test("keeps the newest asset selection when loads resolve out of order", async () => {
    const module = await loadApp();
    expect(module, "App module must exist").not.toBeNull();
    if (!module) return;

    const dependencies = createDependencies();
    const first = deferred<string>();
    const second = deferred<string>();
    dependencies.loadAssetText = async (assetId) => {
      if (assetId === "mf-fa3-example-01") {
        return first.promise;
      }
      if (assetId === "mf-fa3-example-02") {
        return second.promise;
      }
      return "<Faktura><NIP>#nip#</NIP><P_2>#invoice_number#</P_2></Faktura>";
    };

    const user = userEvent.setup();
    render(<module.App dependencies={dependencies} />);
    await screen.findByText("WebMCP unavailable");
    await screen.findByRole("button", { name: "Manual demo fallback" });

    await user.click(
      screen.getByRole("button", { name: /MF FA\(3\) Example 1MF example/u }),
    );
    await user.click(
      screen.getByRole("button", { name: /MF FA\(3\) Example 2MF example/u }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Validate XML",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Manual demo fallback",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    second.resolve("<Faktura>second</Faktura>");
    await waitFor(() =>
      expect(screen.getByTestId("source-code").textContent).toContain("second"),
    );
    await act(async () => {
      first.resolve("<Faktura>first</Faktura>");
      await new Promise((resolveTick) => setTimeout(resolveTick, 0));
    });

    expect(screen.getByTestId("source-code").textContent).toContain("second");
    expect(dependencies.store.getState().selectedAssetId).toBe(
      "mf-fa3-example-02",
    );
  });

  test("disables proposal rejection while another asset is loading", async () => {
    const module = await loadApp();
    expect(module, "App module must exist").not.toBeNull();
    if (!module) return;

    const dependencies = createDependencies();
    const nextAsset = deferred<string>();
    const defaultLoader = dependencies.loadAssetText;
    dependencies.loadAssetText = async (assetId) =>
      assetId === "mf-fa3-example-01"
        ? nextAsset.promise
        : defaultLoader(assetId);
    const user = userEvent.setup();
    render(<module.App dependencies={dependencies} />);
    await screen.findByRole("button", { name: "Manual demo fallback" });
    await user.click(
      screen.getByRole("button", { name: "Manual demo fallback" }),
    );

    await user.click(
      screen.getByRole("button", { name: /MF FA\(3\) Example 1MF example/u }),
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Reject proposal",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    nextAsset.resolve("<Faktura>next</Faktura>");
    await waitFor(() =>
      expect(dependencies.store.getState().selectedAssetId).toBe(
        "mf-fa3-example-01",
      ),
    );
  });
});
