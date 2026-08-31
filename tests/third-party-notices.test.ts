import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const notices = [
  {
    path: "public/third-party/cirfmf/ksef-client-csharp/LICENCE.txt",
    bytes: 1072,
    sha256: "6fdffadac60b13d29bcca88c1bd12601766d9ccd4df8b429e8390e58999cfad4",
  },
  {
    path: "public/third-party/cirfmf/ksef-client-java/LICENSE.md",
    bytes: 1071,
    sha256: "00ffc6c7dc0b326af520702bb3f2486d5b5d55da83a8bbf75d80a685da079612",
  },
  {
    path: "public/third-party/cirfmf/ksef-pdf-generator/LICENSE",
    bytes: 1061,
    sha256: "9662b569e11fc1d3a7d988c813d5d1745bb608f1c49c86946ee34d1d382cf4c2",
  },
  {
    path: "public/third-party/cirfmf/ksef-api/LICENSE.txt",
    bytes: 1079,
    sha256: "f813e0850875814fd117d10803221c6032ef32fe3415e9f1d37fb1a115c3c07b",
  },
];

describe("third-party source notices", () => {
  test("preserves every pinned CIRFMF license file byte-for-byte", () => {
    for (const notice of notices) {
      const bytes = readFileSync(resolve(root, notice.path));
      expect(bytes.byteLength, notice.path).toBe(notice.bytes);
      expect(
        createHash("sha256").update(bytes).digest("hex"),
        notice.path,
      ).toBe(notice.sha256);
    }

    const attributes = readFileSync(resolve(root, ".gitattributes"), "utf8");
    const prettierIgnore = readFileSync(
      resolve(root, ".prettierignore"),
      "utf8",
    );
    expect(attributes).toContain("public/third-party/** -text -diff");
    expect(prettierIgnore).toContain("public/third-party/");
  });

  test("links local notices and keeps public redistribution explicitly gated", () => {
    const thirdParty = readFileSync(
      resolve(root, "THIRD_PARTY_NOTICES.md"),
      "utf8",
    );
    const adjacent = readFileSync(
      resolve(root, "public/official-assets/NOTICE.md"),
      "utf8",
    );

    for (const notice of notices) {
      expect(thirdParty).toContain(notice.path);
    }
    expect(adjacent).toContain(
      "does not state that these materials are public domain",
    );
    expect(adjacent).toContain("No endorsement");
    expect(adjacent).toContain("public redistribution remains a separate gate");
  });
});
