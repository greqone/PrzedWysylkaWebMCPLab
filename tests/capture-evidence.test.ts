import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

describe("capture evidence provenance", () => {
  test("binds the committed screenshot to the current manifest and harness scope", () => {
    const manifestBytes = readFileSync(
      resolve(root, "data/official-assets.lock.json"),
    );
    const sourceScopeBytes = readFileSync(
      resolve(root, "data/official-source-scope.json"),
    );
    const screenshotBytes = readFileSync(
      resolve(root, "docs/assets/workbench.png"),
    );
    const evidence = JSON.parse(
      readFileSync(resolve(root, "docs/assets/workbench.capture.json"), "utf8"),
    ) as {
      schemaVersion: number;
      generatedBy: string;
      evidenceScope: string;
      manifestSha256: string;
      sourceScopeSha256: string;
      screenshotSha256: string;
      corpus: { records: number; xml: number; xsd: number; fa3Xml: number };
      toolNames: string[];
      selectedAssetId: string;
      state: string;
    };

    expect(evidence).toEqual({
      schemaVersion: 1,
      generatedBy: "npm run capture:demo",
      evidenceScope:
        "real Chromium with a standards-shaped injected WebMCP harness; not browser-native API or agent proof",
      manifestSha256: sha256(manifestBytes),
      sourceScopeSha256: sha256(sourceScopeBytes),
      screenshotSha256: sha256(screenshotBytes),
      corpus: { records: 55, xml: 45, xsd: 10, fa3Xml: 44 },
      toolNames: [
        "get_workspace_status",
        "list_official_assets",
        "read_official_asset",
        "select_official_asset",
        "stage_exact_replacements",
        "validate_workspace",
      ],
      selectedAssetId: "cirfmf-template-base",
      state: "pending-human-approval",
    });
  });
});
