export type AssetKind = "xml" | "xsd";

export type AssetRole =
  | "mf-valid-example"
  | "cirfmf-fa3-template"
  | "cirfmf-fa3-example"
  | "related-ubl"
  | "canonical-xsd-root"
  | "canonical-xsd-dependency"
  | "cirfmf-xsd-source"
  | "cirfmf-api-xsd-source";

export type ExpectedValidation =
  "valid" | "invalid-template" | "not-applicable" | "schema";

export interface AssetRecord {
  id: string;
  kind: AssetKind;
  role: AssetRole;
  title: string;
  localPath: string;
  sourceUrl: string;
  sourcePath: string;
  sourceRevision?: string;
  sha256: string;
  bytes: number;
  namespace: string | null;
  rootElement: string | null;
  expectedValidation: ExpectedValidation;
  contentDuplicateOf?: string;
}

export interface AssetManifest {
  schemaVersion: 1;
  frozenAt: string;
  canonicalSchema: {
    rootId: string;
    dependencyIds: string[];
  };
  expectedCounts: {
    assets: number;
    mfValidExamples: number;
    cirfmfFa3Templates: number;
    cirfmfFa3Examples: number;
    relatedUbl: number;
    canonicalXsd: number;
    cirfmfXsdSources: number;
    cirfmfApiXsdSources: number;
  };
  assets: AssetRecord[];
}

export interface AssetFilter {
  kind?: AssetKind;
  role?: AssetRole | string;
  search?: string;
}

export interface LoadAssetOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}
