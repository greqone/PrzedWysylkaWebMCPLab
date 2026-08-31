import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

const manifestBytes = readFileSync(
  resolve(root, "data/official-assets.lock.json"),
);
const scopeBytes = readFileSync(
  resolve(root, "data/official-source-scope.json"),
);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  assets: Array<{
    kind: "xml" | "xsd";
    namespace: string | null;
    sourceUrl: string;
    sourcePath: string;
  }>;
};
const scope = JSON.parse(scopeBytes.toString("utf8")) as {
  cirfmfRepositories: Array<{
    name: string;
    commit: string;
    defaultBranch: string;
    archive: { sourceUrl: string; bytes: number; sha256: string };
  }>;
};

type RepositoryCensus = {
  name: string;
  remoteUrl: string;
  defaultHeadUrl: string;
  defaultHeadTransport: string;
  defaultBranch: string;
  pinnedCommit: string;
  currentDefaultHead: string;
  defaultHeadMatchesPin: boolean;
  archive: { sourceUrl: string; bytes: number; sha256: string };
  archiveMemberCount: number;
  fileCount: number;
  totalUncompressedBytes: number;
  xmlPaths: string[];
  xsdPaths: string[];
  fa3XmlPaths: string[];
  fa3XsdPaths: string[];
  excludedXmlPaths: string[];
  excludedXsdPaths: string[];
  malformedXmlPaths: string[];
  xmlRoots: Array<{ path: string; namespace: string; rootElement: string }>;
  xsdRoots: Array<{ path: string; namespace: string; rootElement: string }>;
};

function repoFromRawUrl(url: string): string | null {
  return (
    url.match(
      /^https:\/\/raw\.githubusercontent\.com\/CIRFMF\/([^/]+)\/[a-f0-9]{40}\//u,
    )?.[1] ?? null
  );
}

function identity(repository: string, path: string) {
  return `${repository}\u0000${path}`;
}

describe("independent CIRFMF default-branch tree census", () => {
  test("reconciles source-rule discovery with the locked runtime corpus", () => {
    const report = JSON.parse(
      readFileSync(
        resolve(root, "docs/assets/cirfmf-tree-census.json"),
        "utf8",
      ),
    ) as {
      schemaVersion: number;
      observedAt: string;
      censusMethod: string;
      manifestSha256: string;
      sourceScopeSha256: string;
      allMatched: boolean;
      defaultHeadsVerified: boolean;
      scopeSnapshotLocked: boolean;
      censusRules: {
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
      totals: {
        repositories: number;
        xmlPaths: number;
        xsdPaths: number;
        fa3XmlPaths: number;
        fa3XsdPaths: number;
        retainedAdjacentXml: number;
      };
      archiveLimits: {
        maxMembersPerArchive: number;
        maxUncompressedBytesPerArchive: number;
        maxXmlOrXsdMemberBytes: number;
      };
      repositories: RepositoryCensus[];
      retainedAdjacentXml: {
        repository: string;
        sourcePath: string;
        namespace: string;
        rootElement: string;
      };
    };

    expect(report).toMatchObject({
      schemaVersion: 1,
      observedAt: "2026-08-31",
      censusMethod:
        "immutable codeload archives plus public-IP-pinned GitHub REST heads; verifier-owned repository snapshots and XML/XSD rules independent of the asset manifest and scope ledger",
      manifestSha256: sha256(manifestBytes),
      sourceScopeSha256: sha256(scopeBytes),
      allMatched: true,
      defaultHeadsVerified: true,
      scopeSnapshotLocked: true,
      censusRules: {
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
      },
      totals: {
        repositories: 6,
        xmlPaths: 39,
        xsdPaths: 31,
        fa3XmlPaths: 18,
        fa3XsdPaths: 6,
        retainedAdjacentXml: 1,
      },
      archiveLimits: {
        maxMembersPerArchive: 10_000,
        maxUncompressedBytesPerArchive: 67_108_864,
        maxXmlOrXsdMemberBytes: 4_194_304,
      },
    });
    expect(report.repositories).toHaveLength(6);

    const scopeByName = new Map(
      scope.cirfmfRepositories.map((repository) => [
        repository.name,
        repository,
      ]),
    );
    for (const repository of report.repositories) {
      const frozen = scopeByName.get(repository.name);
      expect(frozen, repository.name).toBeDefined();
      expect(repository.defaultBranch, repository.name).toBe(
        frozen?.defaultBranch,
      );
      expect(repository.remoteUrl, repository.name).toBe(
        `https://github.com/CIRFMF/${repository.name}.git`,
      );
      expect(repository.defaultHeadUrl, repository.name).toBe(
        `https://api.github.com/repos/CIRFMF/${repository.name}/git/ref/heads/main`,
      );
      expect(repository.defaultHeadTransport, repository.name).toBe(
        "proxy-disabled public-IP-pinned HTTPS with peer revalidation",
      );
      expect(repository.pinnedCommit, repository.name).toBe(frozen?.commit);
      expect(repository.currentDefaultHead, repository.name).toBe(
        frozen?.commit,
      );
      expect(repository.defaultHeadMatchesPin, repository.name).toBe(true);
      expect(repository.archive, repository.name).toEqual(frozen?.archive);
      expect(
        repository.archiveMemberCount,
        repository.name,
      ).toBeGreaterThanOrEqual(repository.fileCount);
      expect(
        repository.archiveMemberCount,
        repository.name,
      ).toBeLessThanOrEqual(10_000);
      expect(repository.malformedXmlPaths, repository.name).toEqual([]);
      expect(
        [...repository.fa3XmlPaths, ...repository.excludedXmlPaths].sort(),
        `${repository.name} XML partition`,
      ).toEqual([...repository.xmlPaths].sort());
      expect(
        [...repository.fa3XsdPaths, ...repository.excludedXsdPaths].sort(),
        `${repository.name} XSD partition`,
      ).toEqual([...repository.xsdPaths].sort());
      expect(
        repository.xmlRoots.map(({ path }) => path).sort(),
        `${repository.name} XML roots`,
      ).toEqual(repository.xmlPaths);
      expect(
        repository.xsdRoots.map(({ path }) => path).sort(),
        `${repository.name} XSD roots`,
      ).toEqual(repository.xsdPaths);
      for (const path of repository.fa3XmlPaths) {
        expect(
          repository.xmlRoots.find((record) => record.path === path),
          `${repository.name}:${path}`,
        ).toMatchObject({
          namespace: "http://crd.gov.pl/wzor/2025/06/25/13775/",
          rootElement: "Faktura",
        });
      }
      for (const root of repository.xsdRoots) {
        expect(root, `${repository.name}:${root.path}`).toMatchObject({
          namespace: "http://www.w3.org/2001/XMLSchema",
          rootElement: "schema",
        });
      }
    }

    const manifestFa3Xml = manifest.assets
      .filter(
        (asset) =>
          asset.kind === "xml" &&
          asset.namespace === "http://crd.gov.pl/wzor/2025/06/25/13775/" &&
          repoFromRawUrl(asset.sourceUrl) !== null,
      )
      .map((asset) =>
        identity(repoFromRawUrl(asset.sourceUrl) ?? "", asset.sourcePath),
      )
      .sort();
    const discoveredFa3Xml = report.repositories
      .flatMap((repository) =>
        repository.fa3XmlPaths.map((path) => identity(repository.name, path)),
      )
      .sort();
    expect(discoveredFa3Xml).toEqual(manifestFa3Xml);

    const manifestFa3Xsd = manifest.assets
      .filter(
        (asset) =>
          asset.kind === "xsd" && repoFromRawUrl(asset.sourceUrl) !== null,
      )
      .map((asset) =>
        identity(repoFromRawUrl(asset.sourceUrl) ?? "", asset.sourcePath),
      )
      .sort();
    const discoveredFa3Xsd = report.repositories
      .flatMap((repository) =>
        repository.fa3XsdPaths.map((path) => identity(repository.name, path)),
      )
      .sort();
    expect(discoveredFa3Xsd).toEqual(manifestFa3Xsd);

    expect(report.retainedAdjacentXml).toEqual({
      repository: "ksef-client-csharp",
      sourcePath:
        "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-pef.xml",
      namespace: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
      rootElement: "Invoice",
    });

    for (const name of ["ksef-latarnia", "ksef-schematy"]) {
      const repository = report.repositories.find(
        (entry) => entry.name === name,
      );
      expect(repository?.xmlPaths, name).toEqual([]);
      expect(repository?.xsdPaths, name).toEqual([]);
      expect(repository?.fa3XmlPaths, name).toEqual([]);
      expect(repository?.fa3XsdPaths, name).toEqual([]);
    }
  });
});
