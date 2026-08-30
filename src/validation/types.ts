export interface ValidationFinding {
  fileName: string | null;
  line: number | null;
  message: string;
  raw: string;
}

export interface ValidationResult {
  valid: boolean;
  findings: ValidationFinding[];
  rawOutput: string;
}

export interface SchemaFile {
  fileName: string;
  contents: string;
}

export interface SchemaBundle {
  root: SchemaFile;
  preload: SchemaFile[];
}

export type AssetTextLoader = (id: string) => Promise<string>;
