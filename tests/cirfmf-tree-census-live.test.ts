import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const script = resolve(root, "scripts/verify-cirfmf-tree-census.py");
const python = process.platform === "win32" ? "python" : "python3";
const fa3Namespace = "http://crd.gov.pl/wzor/2025/06/25/13775/";
const retainedAdjacentXml = {
  repository: "ksef-client-csharp",
  sourcePath: "KSeF.Client.Tests.Core/Templates/invoice-template-fa-3-pef.xml",
  namespace: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  rootElement: "Invoice",
};

type RootRecord = { path: string; namespace: string; rootElement: string };
type RepositoryResult = {
  name: string;
  defaultHeadUrl: string;
  defaultHeadTransport: string;
  pinnedCommit: string;
  currentDefaultHead: string;
  archive: { sourceUrl: string; bytes: number; sha256: string };
  xmlPaths: string[];
  xsdPaths: string[];
  fa3XmlPaths: string[];
  fa3XsdPaths: string[];
  excludedXmlPaths: string[];
  excludedXsdPaths: string[];
  malformedXmlPaths: string[];
  xmlRoots: RootRecord[];
  xsdRoots: RootRecord[];
};
type CensusResult = {
  allMatched: boolean;
  defaultHeadsVerified: boolean;
  scopeSnapshotLocked: boolean;
  censusRules: {
    fa3XmlNamespace: string;
    fa3XmlRootElement: string;
    fa3XsdPathGlobs: Record<string, string[]>;
    retainedAdjacentXml: typeof retainedAdjacentXml;
  };
  totals: {
    repositories: number;
    xmlPaths: number;
    xsdPaths: number;
    fa3XmlPaths: number;
    fa3XsdPaths: number;
    retainedAdjacentXml: number;
  };
  repositories: RepositoryResult[];
  retainedAdjacentXml: typeof retainedAdjacentXml;
};

const manifest = JSON.parse(
  readFileSync(resolve(root, "data/official-assets.lock.json"), "utf8"),
) as {
  assets: Array<{
    kind: "xml" | "xsd";
    namespace: string | null;
    sourceUrl: string;
    sourcePath: string;
  }>;
};
const scope = JSON.parse(
  readFileSync(resolve(root, "data/official-source-scope.json"), "utf8"),
) as {
  cirfmfRepositories: Array<{
    name: string;
    commit: string;
    archive: { sourceUrl: string; bytes: number; sha256: string };
  }>;
};

function repositoryFromRawUrl(url: string) {
  return (
    url.match(
      /^https:\/\/raw\.githubusercontent\.com\/CIRFMF\/([^/]+)\/[a-f0-9]{40}\//u,
    )?.[1] ?? null
  );
}

function identities(
  records: Array<{ name: string; paths: string[] }>,
): string[] {
  return records
    .flatMap(({ name, paths }) => paths.map((path) => `${name}\u0000${path}`))
    .sort();
}

function run(...args: string[]) {
  return spawnSync(python, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
}

describe("live CIRFMF tree census execution", () => {
  test("re-enumerates all six default trees instead of trusting the report", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "cirfmf-live-census-"));
    const reportPath = resolve(directory, "live.json");
    try {
      const result = run("--report-path", reportPath);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(
        "CIRFMF tree census verified: 6 default-branch heads, 18 FA(3) XML paths, and 6 FA(3) XSD paths.",
      );
      const report = JSON.parse(
        readFileSync(reportPath, "utf8"),
      ) as CensusResult;
      const committed = JSON.parse(
        readFileSync(
          resolve(root, "docs/assets/cirfmf-tree-census.json"),
          "utf8",
        ),
      ) as CensusResult;

      expect(report).toEqual(committed);
      expect(report.allMatched).toBe(true);
      expect(report.defaultHeadsVerified).toBe(true);
      expect(report.scopeSnapshotLocked).toBe(true);
      expect(report.totals).toEqual({
        repositories: 6,
        xmlPaths: 39,
        xsdPaths: 31,
        fa3XmlPaths: 18,
        fa3XsdPaths: 6,
        retainedAdjacentXml: 1,
      });
      expect(report.censusRules).toEqual({
        fa3XmlNamespace: fa3Namespace,
        fa3XmlRootElement: "Faktura",
        fa3XsdPathGlobs: {
          "ksef-api": [
            "faktury/schemy/FA/bazowe/*.xsd",
            "faktury/schemy/FA/schemat_FA(3)_*.xsd",
          ],
          "ksef-client-csharp": ["KSeF.Client.Tests.Core/Schemas/*.xsd"],
        },
        retainedAdjacentXml,
      });

      const scopeByName = new Map(
        scope.cirfmfRepositories.map((repository) => [
          repository.name,
          repository,
        ]),
      );
      for (const repository of report.repositories) {
        const frozen = scopeByName.get(repository.name);
        expect(frozen, repository.name).toBeDefined();
        expect(repository.pinnedCommit, repository.name).toBe(frozen?.commit);
        expect(repository.currentDefaultHead, repository.name).toBe(
          frozen?.commit,
        );
        expect(repository.archive, repository.name).toEqual(frozen?.archive);
        expect(repository.defaultHeadUrl, repository.name).toBe(
          `https://api.github.com/repos/CIRFMF/${repository.name}/git/ref/heads/main`,
        );
        expect(repository.defaultHeadTransport, repository.name).toBe(
          "proxy-disabled public-IP-pinned HTTPS with peer revalidation",
        );
        expect(repository.malformedXmlPaths, repository.name).toEqual([]);
        expect(
          [...repository.fa3XmlPaths, ...repository.excludedXmlPaths].sort(),
          `${repository.name} XML partition`,
        ).toEqual(repository.xmlPaths);
        expect(
          [...repository.fa3XsdPaths, ...repository.excludedXsdPaths].sort(),
          `${repository.name} XSD partition`,
        ).toEqual(repository.xsdPaths);
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
            namespace: fa3Namespace,
            rootElement: "Faktura",
          });
        }
        for (const record of repository.xsdRoots) {
          expect(record, `${repository.name}:${record.path}`).toMatchObject({
            namespace: "http://www.w3.org/2001/XMLSchema",
            rootElement: "schema",
          });
        }
      }

      const manifestFa3Xml = manifest.assets
        .filter(
          (asset) =>
            asset.kind === "xml" &&
            asset.namespace === fa3Namespace &&
            repositoryFromRawUrl(asset.sourceUrl) !== null,
        )
        .map(
          (asset) =>
            `${repositoryFromRawUrl(asset.sourceUrl)}\u0000${asset.sourcePath}`,
        )
        .sort();
      const manifestFa3Xsd = manifest.assets
        .filter(
          (asset) =>
            asset.kind === "xsd" &&
            repositoryFromRawUrl(asset.sourceUrl) !== null,
        )
        .map(
          (asset) =>
            `${repositoryFromRawUrl(asset.sourceUrl)}\u0000${asset.sourcePath}`,
        )
        .sort();
      expect(
        identities(
          report.repositories.map(({ name, fa3XmlPaths: paths }) => ({
            name,
            paths,
          })),
        ),
      ).toEqual(manifestFa3Xml);
      expect(
        identities(
          report.repositories.map(({ name, fa3XsdPaths: paths }) => ({
            name,
            paths,
          })),
        ),
      ).toEqual(manifestFa3Xsd);
      expect(report.retainedAdjacentXml).toEqual(retainedAdjacentXml);
      const adjacentRepository = report.repositories.find(
        ({ name }) => name === retainedAdjacentXml.repository,
      );
      expect(
        adjacentRepository?.xmlRoots.find(
          ({ path }) => path === retainedAdjacentXml.sourcePath,
        ),
      ).toEqual({
        path: retainedAdjacentXml.sourcePath,
        namespace: retainedAdjacentXml.namespace,
        rootElement: retainedAdjacentXml.rootElement,
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
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  test("rejects hostile archive metadata before extraction", () => {
    const result = run("--self-test-safety");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "archive safety self-test: member-count, zip64-record, total-expansion, xml-xsd-member-size, central-local-bounds, duplicate-name, unsafe-path",
    );
  });

  test("rejects every scope-controlled snapshot identity mutation", () => {
    const result = run("--self-test-snapshot-lock");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "snapshot lock self-test: name, defaultBranch, commit, archive.sourceUrl, archive.bytes, archive.sha256, fa3XmlSourceRecords, fa3XsdSourceRecords",
    );
  });
});
