import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyAssetManifest(root) {
  const errors = [];
  const manifestPath = resolve(root, "data", "official-assets.lock.json");
  if (!existsSync(manifestPath)) {
    return { ok: false, checked: 0, errors: ["asset manifest is missing"] };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      checked: 0,
      errors: [`asset manifest is not valid JSON: ${String(error)}`],
    };
  }

  if (!Array.isArray(manifest.assets)) {
    return {
      ok: false,
      checked: 0,
      errors: ["manifest.assets must be an array"],
    };
  }

  const publicRoot = resolve(root, "public");
  const allowedPrefix = `${publicRoot}${sep}`;
  const ids = new Set();

  for (const asset of manifest.assets) {
    const id = typeof asset.id === "string" ? asset.id : "<missing-id>";
    if (ids.has(id)) errors.push(`${id}: duplicate asset ID`);
    ids.add(id);

    if (typeof asset.localPath !== "string") {
      errors.push(`${id}: localPath is missing`);
      continue;
    }

    const filePath = resolve(publicRoot, asset.localPath);
    if (!filePath.startsWith(allowedPrefix)) {
      errors.push(`${id}: localPath escapes public directory`);
      continue;
    }
    if (!existsSync(filePath)) {
      errors.push(`${id}: file is missing`);
      continue;
    }

    const bytes = readFileSync(filePath);
    if (bytes.length !== asset.bytes) {
      errors.push(
        `${id}: byte length mismatch (expected ${asset.bytes}, received ${bytes.length})`,
      );
    }
    if (sha256(bytes) !== asset.sha256) {
      errors.push(`${id}: SHA-256 mismatch`);
    }
  }

  return {
    ok: errors.length === 0,
    checked: manifest.assets.length,
    errors,
  };
}
