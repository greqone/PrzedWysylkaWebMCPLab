import { describe, expect, test } from "vitest";

type RegistryModule = {
  listAssets(filter?: {
    kind?: "xml" | "xsd";
    role?: string;
    search?: string;
  }): Array<{ id: string; kind: "xml" | "xsd"; role: string; title: string }>;
  getAsset(id: string): { id: string; title: string };
  loadAssetText(
    id: string,
    options?: { fetchImpl?: typeof fetch; signal?: AbortSignal },
  ): Promise<string>;
};

async function loadRegistry(): Promise<RegistryModule | null> {
  return import("./registry").catch(
    () => null,
  ) as Promise<RegistryModule | null>;
}

describe("official asset registry", () => {
  test("filters the complete corpus without mutating manifest order", async () => {
    const registry = await loadRegistry();
    expect(registry, "asset registry module must exist").not.toBeNull();
    if (!registry) return;

    expect(registry.listAssets()).toHaveLength(36);
    expect(registry.listAssets({ kind: "xml" })).toHaveLength(30);
    expect(registry.listAssets({ kind: "xsd" })).toHaveLength(6);
    expect(registry.listAssets({ role: "mf-valid-example" })).toHaveLength(26);
    expect(registry.listAssets({ search: "Example 26" })).toHaveLength(1);
    expect(registry.listAssets()[0]?.id).toBe("mf-fa3-example-01");
  });

  test("fails closed for unknown IDs", async () => {
    const registry = await loadRegistry();
    expect(registry, "asset registry module must exist").not.toBeNull();
    if (!registry) return;

    expect(() => registry.getAsset("not-real")).toThrow(
      "Unknown official asset",
    );
  });

  test("loads asset text through an injected fetch implementation", async () => {
    const registry = await loadRegistry();
    expect(registry, "asset registry module must exist").not.toBeNull();
    if (!registry) return;

    const requests: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response("<Faktura/>", { status: 200 });
    }) as typeof fetch;

    await expect(
      registry.loadAssetText("mf-fa3-example-01", { fetchImpl }),
    ).resolves.toBe("<Faktura/>");
    expect(requests[0]).toBe("/official-assets/mf/examples/fa3-example-01.xml");
  });
});
