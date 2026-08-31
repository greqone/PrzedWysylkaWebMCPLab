import type { XMLValidationError } from "xmllint-wasm";

import type { ValidationFinding } from "./types";

const schemaBoilerplate = /^.*?Schemas validity error\s*:\s*/u;

export function normalizeValidationErrors(
  errors: ReadonlyArray<XMLValidationError>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const seen = new Set<string>();

  for (const error of errors) {
    const message = error.message.replace(schemaBoilerplate, "").trim();
    const fileName = error.loc?.fileName ?? null;
    const line = error.loc?.lineNumber ?? null;
    const key = `${fileName ?? ""}\u0000${line ?? ""}\u0000${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      fileName,
      line,
      message,
      raw: error.rawMessage,
    });
  }

  return findings;
}
