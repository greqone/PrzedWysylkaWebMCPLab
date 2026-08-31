import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "data/official-assets.lock.json"), "utf8"),
) as {
  sources: Record<string, { repository?: string; commit?: string }>;
  assets: Array<{
    id: string;
    kind: "xml" | "xsd";
    role: string;
    localPath: string;
    sourceUrl: string;
    sourcePath: string;
    sourceRevision?: string;
    sha256: string;
    bytes: number;
    namespace: string | null;
    expectedValidation: string;
    contentDuplicateOf?: string;
  }>;
};

const pins = {
  "ksef-client-csharp": "04f01c1c7834336a3aef1804149cd5bcbd883a3e",
  "ksef-client-java": "fd948a3d70c86335a216d988e52c697b59065a4c",
  "ksef-pdf-generator": "1835553940728b8cb88f8b0298da732d56a3d2a5",
  "ksef-api": "93b843d5def041f69fe2a26d0d90a53e9fa9987a",
} as const;

const expectedFa3XmlPaths = new Map<string, string[]>([
  [
    "ksef-client-csharp",
    [
      "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-with-attachment.xml",
      "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-with-custom-Subject2.xml",
      "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-with-custom-Subject3.xml",
      "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-with-disallowed-unicode-characters.xml",
      "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-with-multiple-Subject3.xml",
      "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3.xml",
      "KSeF.Client.Tests.PdfTestApp/Externals/ksef-pdf-generator/assets/invoice.xml",
      "KSeF.Client.Tests/Templates/invoice-template-fa-3-with-attachment.xml",
      "KSeF.Client.Tests/Templates/invoice-template-fa-3-with-custom-Subject2.xml",
      "KSeF.Client.Tests/Templates/invoice-template-fa-3-with-custom-Subject3.xml",
      "KSeF.Client.Tests/Templates/invoice-template-fa-3.xml",
      "KSeF.DemoWebApp/Templates/invoice-template-fa-3.xml",
    ],
  ],
  [
    "ksef-client-java",
    [
      "demo-web-app/src/integrationTest/resources/xml/invoices/sample/invoice-template-fa-3-with-custom-subject_2.xml",
      "demo-web-app/src/integrationTest/resources/xml/invoices/sample/invoice-template-fa-3-with-custom-subject_3.xml",
      "demo-web-app/src/integrationTest/resources/xml/invoices/sample/invoice-template_v3.xml",
      "demo-web-app/src/integrationTest/resources/xml/invoices/sample/invoice_template_v3_self_invoicing.xml",
      "demo-web-app/src/main/resources/xml/invoices/sample/invoice-template_v3.xml",
    ],
  ],
  ["ksef-pdf-generator", ["assets/invoice.xml"]],
]);

const expectedApiFa3XsdPaths = [
  "faktury/schemy/FA/bazowe/ElementarneTypyDanych_v10-0E.xsd",
  "faktury/schemy/FA/bazowe/KodyKrajow_v10-0E.xsd",
  "faktury/schemy/FA/bazowe/StrukturyDanych_v10-0E.xsd",
  "faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd",
];

function cirfmfRepo(asset: (typeof manifest.assets)[number]): string | null {
  const match = asset.sourceUrl.match(
    /^https:\/\/raw\.githubusercontent\.com\/CIRFMF\/([^/]+)\/[^/]+\//u,
  );
  return match?.[1] ?? null;
}

describe("frozen first-party FA(3) source inventory", () => {
  test("records the closed completeness scope, including zero-match repositories", () => {
    const scope = JSON.parse(
      readFileSync(resolve(root, "data/official-source-scope.json"), "utf8"),
    ) as {
      schemaVersion: number;
      observedAt: string;
      unrestrictedHistoryIncluded: boolean;
      totals: Record<string, number>;
      cirfmfRepositories: Array<{
        name: string;
        commit: string;
        defaultBranch: string;
        archive: {
          sourceUrl: string;
          bytes: number;
          sha256: string;
        };
        fa3XmlSourceRecords: number;
        fa3XsdSourceRecords: number;
      }>;
      cirfmfCensusRules: {
        fa3XmlNamespace: string;
        fa3XmlRootElement: string;
        fa3XsdPathGlobs: Record<string, string[]>;
        retainedAdjacentXml: {
          repository: string;
          sourcePath: string;
          namespace: string;
          rootElement: string;
        };
      };
      cirfmfLicenseResources: Array<{
        repository: string;
        commit: string;
        sourceUrl: string;
        localPath: string;
        bytes: number;
        sha256: string;
      }>;
      exclusions: string[];
    };

    expect(scope.schemaVersion).toBe(1);
    expect(scope.observedAt).toBe("2026-08-31");
    expect(scope.unrestrictedHistoryIncluded).toBe(false);
    expect(scope.totals).toEqual({
      sourceRecords: 55,
      xmlSourceRecords: 45,
      xsdSourceRecords: 10,
      fa3XmlSourceRecords: 44,
      fa3XmlUniqueBlobs: 40,
      xsdUniqueBlobs: 8,
      adjacentUblSourceRecords: 1,
    });
    expect(scope.cirfmfRepositories).toMatchObject([
      {
        name: "ksef-api",
        commit: "93b843d5def041f69fe2a26d0d90a53e9fa9987a",
        fa3XmlSourceRecords: 0,
        fa3XsdSourceRecords: 4,
      },
      {
        name: "ksef-client-csharp",
        commit: "04f01c1c7834336a3aef1804149cd5bcbd883a3e",
        fa3XmlSourceRecords: 12,
        fa3XsdSourceRecords: 2,
      },
      {
        name: "ksef-client-java",
        commit: "fd948a3d70c86335a216d988e52c697b59065a4c",
        fa3XmlSourceRecords: 5,
        fa3XsdSourceRecords: 0,
      },
      {
        name: "ksef-latarnia",
        commit: "b3d819616eb640270a2e11321d424f206d5e0b1a",
        fa3XmlSourceRecords: 0,
        fa3XsdSourceRecords: 0,
      },
      {
        name: "ksef-pdf-generator",
        commit: "1835553940728b8cb88f8b0298da732d56a3d2a5",
        fa3XmlSourceRecords: 1,
        fa3XsdSourceRecords: 0,
      },
      {
        name: "ksef-schematy",
        commit: "cd826b831f74f73533ccf26876439ab8d9efdcf5",
        fa3XmlSourceRecords: 0,
        fa3XsdSourceRecords: 0,
      },
    ]);
    for (const repository of scope.cirfmfRepositories) {
      expect(repository.defaultBranch, repository.name).toBe("main");
      expect(repository.archive.sourceUrl, repository.name).toBe(
        `https://codeload.github.com/CIRFMF/${repository.name}/zip/${repository.commit}`,
      );
      expect(repository.archive.bytes, repository.name).toBeGreaterThan(0);
      expect(repository.archive.sha256, repository.name).toMatch(
        /^[a-f0-9]{64}$/u,
      );
    }
    expect(scope.cirfmfCensusRules).toEqual({
      fa3XmlNamespace: "http://crd.gov.pl/wzor/2025/06/25/13775/",
      fa3XmlRootElement: "Faktura",
      fa3XsdPathGlobs: {
        "ksef-api": [
          "faktury/schemy/FA/bazowe/*.xsd",
          "faktury/schemy/FA/schemat_FA(3)_*.xsd",
        ],
        "ksef-client-csharp": ["KSeF.Client.Tests.Core/Schemas/*.xsd"],
      },
      retainedAdjacentXml: {
        repository: "ksef-client-csharp",
        sourcePath:
          "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-pef.xml",
        namespace: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
        rootElement: "Invoice",
      },
    });
    expect(scope.cirfmfLicenseResources).toEqual([
      {
        repository: "ksef-api",
        commit: "93b843d5def041f69fe2a26d0d90a53e9fa9987a",
        sourceUrl:
          "https://raw.githubusercontent.com/CIRFMF/ksef-api/93b843d5def041f69fe2a26d0d90a53e9fa9987a/LICENSE.txt",
        localPath: "public/third-party/cirfmf/ksef-api/LICENSE.txt",
        bytes: 1079,
        sha256:
          "f813e0850875814fd117d10803221c6032ef32fe3415e9f1d37fb1a115c3c07b",
      },
      {
        repository: "ksef-client-csharp",
        commit: "04f01c1c7834336a3aef1804149cd5bcbd883a3e",
        sourceUrl:
          "https://raw.githubusercontent.com/CIRFMF/ksef-client-csharp/04f01c1c7834336a3aef1804149cd5bcbd883a3e/LICENCE.txt",
        localPath: "public/third-party/cirfmf/ksef-client-csharp/LICENCE.txt",
        bytes: 1072,
        sha256:
          "6fdffadac60b13d29bcca88c1bd12601766d9ccd4df8b429e8390e58999cfad4",
      },
      {
        repository: "ksef-client-java",
        commit: "fd948a3d70c86335a216d988e52c697b59065a4c",
        sourceUrl:
          "https://raw.githubusercontent.com/CIRFMF/ksef-client-java/fd948a3d70c86335a216d988e52c697b59065a4c/LICENSE.md",
        localPath: "public/third-party/cirfmf/ksef-client-java/LICENSE.md",
        bytes: 1071,
        sha256:
          "00ffc6c7dc0b326af520702bb3f2486d5b5d55da83a8bbf75d80a685da079612",
      },
      {
        repository: "ksef-pdf-generator",
        commit: "1835553940728b8cb88f8b0298da732d56a3d2a5",
        sourceUrl:
          "https://raw.githubusercontent.com/CIRFMF/ksef-pdf-generator/1835553940728b8cb88f8b0298da732d56a3d2a5/LICENSE",
        localPath: "public/third-party/cirfmf/ksef-pdf-generator/LICENSE",
        bytes: 1061,
        sha256:
          "9662b569e11fc1d3a7d988c813d5d1745bb608f1c49c86946ee34d1d382cf4c2",
      },
    ]);
    expect(scope.exclusions).toEqual(
      expect.arrayContaining([
        "FA(2)",
        "FA_RR",
        "UPO",
        "authentication",
        "PEF/UBL except the retained adjacent record",
        "non-default branches, tags, releases, and unreachable Git history",
        "forks outside CIRFMF",
        "future publications after the observation date",
      ]),
    );
  });

  test("pins every scoped CIRFMF repository to the reviewed commit", () => {
    const configured = Object.values(manifest.sources).filter((source) =>
      source.repository?.startsWith("https://github.com/CIRFMF/"),
    );
    const actual = Object.fromEntries(
      configured.map((source) => [
        source.repository?.split("/").at(-1),
        source.commit,
      ]),
    );

    expect(actual).toMatchObject(pins);
  });

  test("binds every CIRFMF raw URL to the same immutable sourceRevision", () => {
    const cirfmfAssets = manifest.assets.filter(
      (asset) => cirfmfRepo(asset) !== null,
    );

    expect(cirfmfAssets.length).toBeGreaterThan(0);
    for (const asset of cirfmfAssets) {
      const match = asset.sourceUrl.match(
        /^https:\/\/raw\.githubusercontent\.com\/CIRFMF\/([^/]+)\/([a-f0-9]{40})\//u,
      );
      expect(match, asset.id).not.toBeNull();
      expect(asset.sourceRevision, `${asset.id} revision`).toBe(match?.[2]);
      expect(match?.[2], `${asset.id} frozen pin`).toBe(
        pins[match?.[1] as keyof typeof pins],
      );
    }
  });

  test("contains every FA(3)-namespace XML source path in the frozen CIRFMF snapshots", () => {
    const fa3Assets = manifest.assets.filter(
      (asset) =>
        asset.kind === "xml" &&
        asset.namespace === "http://crd.gov.pl/wzor/2025/06/25/13775/" &&
        cirfmfRepo(asset) !== null,
    );

    const expectedPaths = [...expectedFa3XmlPaths.values()].flat();
    expect(fa3Assets).toHaveLength(18);
    expect(new Set(fa3Assets.map((asset) => asset.sha256)).size).toBe(14);
    expect(
      fa3Assets.filter((asset) => asset.expectedValidation === "valid"),
    ).toHaveLength(2);
    expect(
      fa3Assets.filter(
        (asset) => asset.expectedValidation === "invalid-template",
      ),
    ).toHaveLength(16);

    for (const [repo, paths] of expectedFa3XmlPaths) {
      const actualPaths = fa3Assets
        .filter((asset) => cirfmfRepo(asset) === repo)
        .map((asset) => asset.sourcePath)
        .sort();
      expect(actualPaths, repo).toEqual([...paths].sort());
      expect(
        fa3Assets
          .filter((asset) => cirfmfRepo(asset) === repo)
          .every(
            (asset) => asset.sourceRevision === pins[repo as keyof typeof pins],
          ),
        `${repo} source revision`,
      ).toBe(true);
    }

    expect(fa3Assets.map((asset) => asset.sourcePath).sort()).toEqual(
      expectedPaths.sort(),
    );
  });

  test("contains every FA(3) XSD source path from the frozen ksef-api snapshot", () => {
    const apiAssets = manifest.assets.filter(
      (asset) => asset.kind === "xsd" && cirfmfRepo(asset) === "ksef-api",
    );

    expect(apiAssets).toHaveLength(4);
    expect(apiAssets.map((asset) => asset.sourcePath).sort()).toEqual(
      [...expectedApiFa3XsdPaths].sort(),
    );
    expect(
      apiAssets.every((asset) => asset.sourceRevision === pins["ksef-api"]),
    ).toBe(true);
  });

  test("keeps duplicate declarations byte-identical to their canonical targets", () => {
    const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
    const duplicates = manifest.assets.filter(
      (asset) => asset.contentDuplicateOf,
    );

    expect(duplicates.length).toBeGreaterThan(0);
    for (const duplicate of duplicates) {
      const target = byId.get(duplicate.contentDuplicateOf ?? "");
      expect(target, `${duplicate.id} duplicate target`).toBeDefined();
      expect(duplicate.sha256, duplicate.id).toBe(target?.sha256);
      expect(duplicate.bytes, duplicate.id).toBe(target?.bytes);
      expect(
        target?.contentDuplicateOf,
        `${duplicate.id} duplicate chain`,
      ).toBeUndefined();
    }
  });

  test("has the complete 55-record scoped corpus", () => {
    expect(manifest.assets).toHaveLength(55);
    expect(new Set(manifest.assets.map((asset) => asset.localPath)).size).toBe(
      55,
    );
    expect(
      new Set(
        manifest.assets.map(
          (asset) =>
            `${asset.sourceUrl}\u0000${asset.sourceRevision ?? ""}\u0000${asset.sourcePath}`,
        ),
      ).size,
    ).toBe(55);
    const xml = manifest.assets.filter((asset) => asset.kind === "xml");
    const xsd = manifest.assets.filter((asset) => asset.kind === "xsd");
    const fa3 = xml.filter(
      (asset) => asset.namespace === "http://crd.gov.pl/wzor/2025/06/25/13775/",
    );
    expect(xml).toHaveLength(45);
    expect(new Set(xml.map((asset) => asset.sha256)).size).toBe(41);
    expect(xsd).toHaveLength(10);
    expect(new Set(xsd.map((asset) => asset.sha256)).size).toBe(8);
    expect(fa3).toHaveLength(44);
    expect(new Set(fa3.map((asset) => asset.sha256)).size).toBe(40);
  });
});
