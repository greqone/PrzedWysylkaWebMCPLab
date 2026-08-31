import { describe, expect, test } from "vitest";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type RegistryModule = {
  isSafeOfficialAssetPath(value: string): boolean;
  listAssets(filter?: {
    kind?: "xml" | "xsd";
    role?: string;
    search?: string;
  }): Array<{ id: string; kind: "xml" | "xsd"; role: string; title: string }>;
  getAsset(id: string): {
    id: string;
    title: string;
    localPath: string;
    sha256: string;
    bytes: number;
  };
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
  test("accepts only canonical relative paths under official-assets", async () => {
    const registry = await loadRegistry();
    expect(registry, "asset registry module must exist").not.toBeNull();
    if (!registry) return;

    expect(
      registry.isSafeOfficialAssetPath(
        "official-assets/mf/examples/fa3-example-01.xml",
      ),
    ).toBe(true);
    for (const unsafe of [
      "official-assets/../private-file",
      "official-assets/./fixture.xml",
      "official-assets//fixture.xml",
      "official-assets/%2e%2e/private-file",
      "official-assets\\..\\private-file",
      "official-assets/fixture.xml?raw=1",
      "official-assets/fixture.xml#fragment",
      "/official-assets/fixture.xml",
    ]) {
      expect(registry.isSafeOfficialAssetPath(unsafe), unsafe).toBe(false);
    }
  });

  test("filters the complete corpus without mutating manifest order", async () => {
    const registry = await loadRegistry();
    expect(registry, "asset registry module must exist").not.toBeNull();
    if (!registry) return;

    expect(registry.listAssets()).toHaveLength(55);
    expect(registry.listAssets({ kind: "xml" })).toHaveLength(45);
    expect(registry.listAssets({ kind: "xsd" })).toHaveLength(10);
    expect(registry.listAssets({ role: "mf-valid-example" })).toHaveLength(26);
    expect(registry.listAssets({ role: "cirfmf-fa3-template" })).toHaveLength(
      16,
    );
    expect(registry.listAssets({ role: "cirfmf-fa3-example" })).toHaveLength(2);
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

  test("loads an asset only when response bytes match the lock", async () => {
    const registry = await loadRegistry();
    expect(registry, "asset registry module must exist").not.toBeNull();
    if (!registry) return;

    const asset = registry.getAsset("mf-fa3-example-01");
    const source = await readFile(resolve("public", asset.localPath));
    const body = source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    ) as ArrayBuffer;
    const requests: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response(body, { status: 200 });
    }) as typeof fetch;

    await expect(
      registry.loadAssetText("mf-fa3-example-01", { fetchImpl }),
    ).resolves.toBe(new TextDecoder().decode(source));
    expect(requests[0]).toBe("/official-assets/mf/examples/fa3-example-01.xml");
  });

  test("rejects same-length content whose SHA-256 does not match the lock", async () => {
    const registry = await loadRegistry();
    expect(registry, "asset registry module must exist").not.toBeNull();
    if (!registry) return;

    const asset = registry.getAsset("mf-fa3-example-01");
    const tampered = new Uint8Array(
      await readFile(resolve("public", asset.localPath)),
    );
    const lastByte = tampered.length - 1;
    tampered[lastByte] = (tampered[lastByte] ?? 0) ^ 1;
    const fetchImpl = (async () =>
      new Response(tampered.buffer, { status: 200 })) as typeof fetch;

    await expect(
      registry.loadAssetText("mf-fa3-example-01", { fetchImpl }),
    ).rejects.toThrow("Asset integrity check failed for mf-fa3-example-01");
  });

  test("rejects content whose byte count does not match the lock", async () => {
    const registry = await loadRegistry();
    expect(registry, "asset registry module must exist").not.toBeNull();
    if (!registry) return;

    const asset = registry.getAsset("mf-fa3-example-01");
    const source = await readFile(resolve("public", asset.localPath));
    const truncated = source.subarray(0, source.length - 1);
    const body = truncated.buffer.slice(
      truncated.byteOffset,
      truncated.byteOffset + truncated.byteLength,
    ) as ArrayBuffer;
    const fetchImpl = (async () =>
      new Response(body, { status: 200 })) as typeof fetch;

    await expect(
      registry.loadAssetText("mf-fa3-example-01", { fetchImpl }),
    ).rejects.toThrow("Asset integrity check failed for mf-fa3-example-01");
  });
});
