import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAssetManifest } from "./asset-verifier.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const report = verifyAssetManifest(root);

if (report.ok) {
  console.log(`Official asset lock verified: ${report.checked} files.`);
} else {
  console.error("Official asset verification failed:");
  for (const error of report.errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
