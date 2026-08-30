// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterEach, describe, expect, test } from "vitest";

import type { ValidationResult } from "./validation/types";
import { createWorkspaceStore } from "./workspace/store";
import type { WorkspaceStore } from "./workspace/types";

afterEach(() => cleanup());

type AppDependencies = {
  store: WorkspaceStore;
  loadAssetText(id: string): Promise<string>;
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

function createDependencies(): AppDependencies {
  let id = 0;
  const store = createWorkspaceStore({
    now: () => "2026-08-30T18:00:00.000Z",
    createId: () => `ui-event-${++id}`,
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
    registerTools: async () => ({ supported: false, controller: null }),
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
  test("keeps an agent proposal pending until human approval and revalidation", async () => {
    const module = await loadApp();
    expect(module, "App module must exist").not.toBeNull();
    if (!module) return;

    const user = userEvent.setup();
    render(<module.App dependencies={createDependencies()} />);

    await waitFor(() =>
      expect(screen.getByTestId("source-code").textContent).toContain("#nip#"),
    );
    expect(screen.getByText("WebMCP unavailable")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Validate XML" }));
    expect(await screen.findByText("Needs attention")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Stage guided repair" }),
    );
    expect(await screen.findByText("Pending human approval")).toBeTruthy();
    expect(screen.getByTestId("source-code").textContent).toContain("#nip#");

    await user.click(screen.getByRole("button", { name: "Approve changes" }));
    await waitFor(() =>
      expect(screen.getByTestId("source-code").textContent).not.toContain(
        "#nip#",
      ),
    );
    expect(screen.getByTestId("source-code").textContent).toContain(
      "FV/2026/001",
    );

    await user.click(screen.getByRole("button", { name: "Validate XML" }));
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
      screen.getByRole("button", { name: "Stage guided repair" }),
    );
    await user.click(screen.getByRole("button", { name: "Reject proposal" }));

    expect(screen.queryByText("Pending human approval")).toBeNull();
    expect(screen.getByTestId("source-code").textContent).toContain("#nip#");
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
      return "<Faktura>default</Faktura>";
    };

    const user = userEvent.setup();
    render(<module.App dependencies={dependencies} />);
    await screen.findByText("WebMCP unavailable");

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
});
