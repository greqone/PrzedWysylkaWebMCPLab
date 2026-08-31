import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SaxesParser } from "saxes";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "data/official-assets.lock.json"), "utf8"),
) as {
  assets: Array<{
    id: string;
    localPath: string;
    namespace: string | null;
    rootElement: string | null;
  }>;
};

type RootMetadata = { namespace: string; localName: string };

function parseRootMetadata(source: string, fileName: string): RootMetadata {
  const parser = new SaxesParser({ xmlns: true, fileName });
  const rootFound = new Error("root-found");
  let metadata: RootMetadata | null = null;
  parser.on("opentag", (tag) => {
    metadata = { namespace: tag.uri, localName: tag.local };
    throw rootFound;
  });

  try {
    parser.write(source);
  } catch (error) {
    if (error !== rootFound) throw error;
  }
  if (!metadata) throw new Error(`${fileName}: XML root element is missing`);
  return metadata;
}

describe("locked source root metadata", () => {
  test("matches every manifest namespace and root element using a namespace-aware parser", () => {
    expect(manifest.assets).toHaveLength(55);

    for (const asset of manifest.assets) {
      const source = readFileSync(
        resolve(root, "public", asset.localPath),
        "utf8",
      );
      const metadata = parseRootMetadata(source, asset.id);
      expect(metadata.namespace, `${asset.id} namespace`).toBe(asset.namespace);
      expect(metadata.localName, `${asset.id} root element`).toBe(
        asset.rootElement,
      );
    }
  });
});
