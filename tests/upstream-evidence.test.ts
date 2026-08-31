import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

describe("upstream corpus verification evidence", () => {
  test("binds all 55 source records to replayed first-party bytes", () => {
    const manifest = readFileSync(
      resolve(root, "data/official-assets.lock.json"),
    );
    const scope = readFileSync(
      resolve(root, "data/official-source-scope.json"),
    );
    const report = JSON.parse(
      readFileSync(
        resolve(root, "docs/assets/upstream-verification.json"),
        "utf8",
      ),
    ) as {
      schemaVersion: number;
      observedAt: string;
      manifestSha256: string;
      sourceScopeSha256: string;
      allMatched: boolean;
      verifiedSourceRecords: number;
      verifiedCorpusHttpResources: number;
      verifiedLicenseResources: number;
      verifiedLicenseHttpResources: number;
      verifiedHttpResources: number;
      sourceClasses: {
        ministryArchiveMembers: number;
        crdDirectRecords: number;
        cirfmfRawGitRecords: number;
      };
      licenseResources: Array<{
        sourceUrl: string;
        localPath: string;
        bytes: number;
        sha256: string;
      }>;
      limits: {
        maxHttpResourceBytes: number;
        maxZipMemberBytes: number;
        readChunkBytes: number;
        readLoopBudgetSeconds: number;
        socketTimeoutSeconds: number;
        transferDeadlineSeconds: number;
      };
      networkPolicy: {
        globallyRoutableDnsOnly: boolean;
        pinnedTcpDestination: boolean;
        peerIpRevalidated: boolean;
        proxiesDisabled: boolean;
      };
      ministryArchiveSha256: string;
    };

    expect(report).toEqual({
      schemaVersion: 1,
      observedAt: "2026-08-31",
      manifestSha256: sha256(manifest),
      sourceScopeSha256: sha256(scope),
      allMatched: true,
      verifiedSourceRecords: 55,
      verifiedCorpusHttpResources: 30,
      verifiedLicenseResources: 4,
      verifiedLicenseHttpResources: 4,
      verifiedHttpResources: 34,
      sourceClasses: {
        ministryArchiveMembers: 26,
        crdDirectRecords: 4,
        cirfmfRawGitRecords: 25,
      },
      licenseResources: [
        {
          sourceUrl:
            "https://raw.githubusercontent.com/CIRFMF/ksef-api/93b843d5def041f69fe2a26d0d90a53e9fa9987a/LICENSE.txt",
          localPath: "public/third-party/cirfmf/ksef-api/LICENSE.txt",
          bytes: 1079,
          sha256:
            "f813e0850875814fd117d10803221c6032ef32fe3415e9f1d37fb1a115c3c07b",
        },
        {
          sourceUrl:
            "https://raw.githubusercontent.com/CIRFMF/ksef-client-csharp/04f01c1c7834336a3aef1804149cd5bcbd883a3e/LICENCE.txt",
          localPath: "public/third-party/cirfmf/ksef-client-csharp/LICENCE.txt",
          bytes: 1072,
          sha256:
            "6fdffadac60b13d29bcca88c1bd12601766d9ccd4df8b429e8390e58999cfad4",
        },
        {
          sourceUrl:
            "https://raw.githubusercontent.com/CIRFMF/ksef-client-java/fd948a3d70c86335a216d988e52c697b59065a4c/LICENSE.md",
          localPath: "public/third-party/cirfmf/ksef-client-java/LICENSE.md",
          bytes: 1071,
          sha256:
            "00ffc6c7dc0b326af520702bb3f2486d5b5d55da83a8bbf75d80a685da079612",
        },
        {
          sourceUrl:
            "https://raw.githubusercontent.com/CIRFMF/ksef-pdf-generator/1835553940728b8cb88f8b0298da732d56a3d2a5/LICENSE",
          localPath: "public/third-party/cirfmf/ksef-pdf-generator/LICENSE",
          bytes: 1061,
          sha256:
            "9662b569e11fc1d3a7d988c813d5d1745bb608f1c49c86946ee34d1d382cf4c2",
        },
      ],
      limits: {
        maxHttpResourceBytes: 16_777_216,
        maxZipMemberBytes: 4_194_304,
        readChunkBytes: 65_536,
        readLoopBudgetSeconds: 90,
        socketTimeoutSeconds: 30,
        transferDeadlineSeconds: 120,
      },
      networkPolicy: {
        globallyRoutableDnsOnly: true,
        pinnedTcpDestination: true,
        peerIpRevalidated: true,
        proxiesDisabled: true,
      },
      ministryArchiveSha256:
        "41ebd3c57144951c65d68a36fbe433285b5791a86a8bd46cb059503e3f8b1e10",
    });
  });
});
