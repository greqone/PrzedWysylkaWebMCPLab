import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "data/official-assets.lock.json"), "utf8"),
);
const windowsDefault = "C:/msys64/ucrt64/bin/xmllint.exe";
const executable =
  process.env.XMLLINT_BIN ??
  (process.platform === "win32" && existsSync(windowsDefault)
    ? windowsDefault
    : "xmllint");

const version = spawnSync(executable, ["--version"], { encoding: "utf8" });
if (version.error) {
  console.error(
    `xmllint is unavailable (${version.error.message}). Install libxml2 or set XMLLINT_BIN.`,
  );
  process.exit(2);
}

const temporary = mkdtempSync(resolve(tmpdir(), "webmcp-native-xsd-"));
const urlAliases = new Map([
  [
    "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/StrukturyDanych_v10-0E.xsd",
    "StrukturyDanych_v10-0E.xsd",
  ],
  [
    "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/ElementarneTypyDanych_v10-0E.xsd",
    "ElementarneTypyDanych_v10-0E.xsd",
  ],
  [
    "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/KodyKrajow_v10-0E.xsd",
    "KodyKrajow_v10-0E.xsd",
  ],
]);

function asset(id) {
  const record = manifest.assets.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Missing locked asset: ${id}`);
  return record;
}

function sourcePath(record) {
  return resolve(root, "public", record.localPath);
}

try {
  const schemaIds = [
    manifest.canonicalSchema.rootId,
    ...manifest.canonicalSchema.dependencyIds,
  ];
  for (const id of schemaIds) {
    const record = asset(id);
    let contents = readFileSync(sourcePath(record), "utf8");
    for (const [url, alias] of urlAliases) {
      contents = contents.replace(
        `schemaLocation="${url}"`,
        `schemaLocation="${alias}"`,
      );
    }
    writeFileSync(resolve(temporary, basename(record.localPath)), contents);
  }

  const rootSchema = resolve(temporary, "schemat.xsd");
  const documents = manifest.assets.filter(
    (record) =>
      record.kind === "xml" &&
      ["valid", "invalid-template"].includes(record.expectedValidation),
  );
  const expectedValidCount = documents.filter(
    (record) => record.expectedValidation === "valid",
  ).length;
  const expectedInvalidCount = documents.length - expectedValidCount;
  const failures = [];
  for (const record of documents) {
    const result = spawnSync(
      executable,
      ["--noout", "--schema", rootSchema, sourcePath(record)],
      { encoding: "buffer" },
    );
    const expectedValid = record.expectedValidation === "valid";
    const actualValid = result.status === 0;
    if (actualValid !== expectedValid) {
      failures.push(
        `${record.id}: expected ${expectedValid ? "valid" : "invalid"}, xmllint exit ${result.status}`,
      );
    }
  }

  if (failures.length) {
    console.error(
      `Native validity-class check failed:\n${failures.join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Native validity-class check verified: ${expectedValidCount} expected-valid and ${expectedInvalidCount} expected-invalid FA(3) source records.`,
    );
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
