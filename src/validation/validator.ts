import { validateXML } from "xmllint-wasm";

import { assetManifest } from "../assets/registry";
import { normalizeValidationErrors } from "./normalize";
import type {
  AssetTextLoader,
  SchemaBundle,
  SchemaFile,
  ValidationResult,
} from "./types";

const aliases = new Map<string, string>([
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

const fileNamesById = new Map<string, string>([
  ["crd-fa3-schema", "schemat.xsd"],
  ["crd-structures-v10", "StrukturyDanych_v10-0E.xsd"],
  ["crd-elementary-types-v10", "ElementarneTypyDanych_v10-0E.xsd"],
  ["crd-country-codes-v10", "KodyKrajow_v10-0E.xsd"],
]);

export interface ValidateXmlOptions {
  schemaBundle: SchemaBundle;
  signal?: AbortSignal;
  validateImpl?: typeof validateXML;
}

function localizeSchemaLocations(contents: string): string {
  let localized = contents;
  for (const [url, fileName] of aliases) {
    const source = `schemaLocation="${url}"`;
    if (localized.includes(source)) {
      localized = localized.replace(source, `schemaLocation="${fileName}"`);
    }
  }
  return localized;
}

function schemaFile(id: string, contents: string): SchemaFile {
  const fileName = fileNamesById.get(id);
  if (!fileName)
    throw new Error(`No resolver alias for canonical schema: ${id}`);
  return { fileName, contents: localizeSchemaLocations(contents) };
}

export async function buildCanonicalSchemaBundle(
  loadById: AssetTextLoader,
): Promise<SchemaBundle> {
  const { rootId, dependencyIds } = assetManifest.canonicalSchema;
  const [rootContents, ...dependencyContents] = await Promise.all([
    loadById(rootId),
    ...dependencyIds.map((id) => loadById(id)),
  ]);

  const root = schemaFile(rootId, rootContents);
  const preload = dependencyIds.map((id, index) => {
    const contents = dependencyContents[index];
    if (contents === undefined) {
      throw new Error(`Canonical schema dependency failed to load: ${id}`);
    }
    return schemaFile(id, contents);
  });

  for (const [url, fileName] of aliases) {
    const unresolved = [root, ...preload].some((file) =>
      file.contents.includes(`schemaLocation="${url}"`),
    );
    if (unresolved) {
      throw new Error(`Schema resolver failed to alias ${url} as ${fileName}`);
    }
  }

  return { root, preload };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Validation aborted", "AbortError");
}

function assertSafeFileName(fileName: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(fileName)) {
    throw new Error(`Unsafe virtual XML file name: ${fileName}`);
  }
}

export async function validateXml(
  xml: string,
  fileName: string,
  options: ValidateXmlOptions,
): Promise<ValidationResult> {
  assertSafeFileName(fileName);
  throwIfAborted(options.signal);

  const validateImpl = options.validateImpl ?? validateXML;
  const result = await validateImpl({
    xml: { fileName, contents: xml },
    schema: [options.schemaBundle.root],
    preload: options.schemaBundle.preload,
    initialMemoryPages: 256,
    maxMemoryPages: 1024,
  });

  throwIfAborted(options.signal);
  return {
    valid: result.valid,
    findings: normalizeValidationErrors(result.errors),
    rawOutput: result.rawOutput,
  };
}
