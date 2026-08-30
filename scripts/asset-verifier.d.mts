export interface VerificationReport {
  ok: boolean;
  checked: number;
  errors: string[];
}

export function verifyAssetManifest(root: string): VerificationReport;
