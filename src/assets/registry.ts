import { z } from "zod";

import rawManifest from "../../data/official-assets.lock.json";
import type {
  AssetFilter,
  AssetManifest,
  AssetRecord,
  LoadAssetOptions,
} from "./types";

export function isSafeOfficialAssetPath(value: string): boolean {
  if (!value.startsWith("official-assets/")) return false;
  if (/[\\%?#]/u.test(value)) return false;

  const segments = value.split("/");
  return (
    segments[0] === "official-assets" &&
    segments.length > 1 &&
    segments
      .slice(1)
      .every(
        (segment) =>
          segment.length > 0 &&
          segment !== "." &&
          segment !== ".." &&
          /^[A-Za-z0-9._-]+$/u.test(segment),
      )
  );
}

const assetRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["xml", "xsd"]),
  role: z.enum([
    "mf-valid-example",
    "cirfmf-fa3-template",
    "cirfmf-fa3-example",
    "related-ubl",
    "canonical-xsd-root",
    "canonical-xsd-dependency",
    "cirfmf-xsd-source",
    "cirfmf-api-xsd-source",
  ]),
  title: z.string().min(1),
  localPath: z
    .string()
    .refine(isSafeOfficialAssetPath, "Unsafe official asset localPath"),
  sourceUrl: z.url(),
  sourcePath: z.string().min(1),
  sourceRevision: z.string().min(1).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().positive(),
  namespace: z.string().nullable(),
  rootElement: z.string().nullable(),
  expectedValidation: z.enum([
    "valid",
    "invalid-template",
    "not-applicable",
    "schema",
  ]),
  contentDuplicateOf: z.string().min(1).optional(),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  frozenAt: z.iso.date(),
  canonicalSchema: z.object({
    rootId: z.string().min(1),
    dependencyIds: z.array(z.string().min(1)).length(3),
  }),
  expectedCounts: z.object({
    assets: z.literal(55),
    mfValidExamples: z.literal(26),
    cirfmfFa3Templates: z.literal(16),
    cirfmfFa3Examples: z.literal(2),
    relatedUbl: z.literal(1),
    canonicalXsd: z.literal(4),
    cirfmfXsdSources: z.literal(2),
    cirfmfApiXsdSources: z.literal(4),
  }),
  assets: z.array(assetRecordSchema).length(55),
});

export const assetManifest = manifestSchema.parse(rawManifest) as AssetManifest;

const assetById = new Map(
  assetManifest.assets.map((asset) => [asset.id, asset] as const),
);

if (assetById.size !== assetManifest.assets.length) {
  throw new Error("Official asset manifest contains duplicate IDs");
}

export function listAssets(filter: AssetFilter = {}): AssetRecord[] {
  const search = filter.search?.trim().toLocaleLowerCase("en") ?? "";

  return assetManifest.assets.filter((asset) => {
    if (filter.kind && asset.kind !== filter.kind) return false;
    if (filter.role && asset.role !== filter.role) return false;
    if (!search) return true;

    return [asset.id, asset.title, asset.sourcePath, asset.role]
      .join(" ")
      .toLocaleLowerCase("en")
      .includes(search);
  });
}

export function getAsset(id: string): AssetRecord {
  const asset = assetById.get(id);
  if (!asset) throw new Error(`Unknown official asset: ${id}`);
  return asset;
}

export function canStageOfficialAssetReplacements(id: string): boolean {
  const asset = getAsset(id);
  return asset.kind === "xml" && asset.role !== "related-ubl";
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "Web Crypto is required to verify official asset integrity",
    );
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadAssetText(
  id: string,
  options: LoadAssetOptions = {},
): Promise<string> {
  const asset = getAsset(id);
  if (!isSafeOfficialAssetPath(asset.localPath)) {
    throw new Error(`Unsafe official asset path: ${asset.localPath}`);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`/${asset.localPath}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load ${id}: HTTP ${response.status} ${response.statusText}`.trim(),
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualSha256 = await sha256Hex(bytes);
  if (bytes.byteLength !== asset.bytes || actualSha256 !== asset.sha256) {
    throw new Error(
      `Asset integrity check failed for ${id}: expected ${asset.bytes} bytes / ${asset.sha256}, received ${bytes.byteLength} bytes / ${actualSha256}`,
    );
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
