import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function classifyFsutilReparseResult(result) {
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  if (
    result.status === 1 &&
    stderr === "" &&
    /^Error 4390: \S[^\r\n]*$/u.test(stdout)
  ) {
    return false;
  }
  throw new Error(
    `fsutil reparse query failed with status ${String(result.status)}`,
  );
}

function isReparsePoint(path, cache) {
  if (cache.has(path)) return cache.get(path);
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) {
    cache.set(path, true);
    return true;
  }
  if (process.platform !== "win32") {
    cache.set(path, false);
    return false;
  }
  const result = spawnSync("fsutil.exe", ["reparsepoint", "query", path], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  const reparse = classifyFsutilReparseResult(result);
  cache.set(path, reparse);
  return reparse;
}

function listXmlAndXsdFiles(directory, publicRoot, errors, reparseCache) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    let reparse;
    try {
      reparse = isReparsePoint(path, reparseCache);
    } catch (error) {
      errors.push(
        `cannot inspect reparse status for ${relative(publicRoot, path).split(sep).join("/")}: ${String(error)}`,
      );
      continue;
    }
    if (reparse) {
      errors.push(
        `symbolic link or reparse point under official-assets: ${relative(publicRoot, path).split(sep).join("/")}`,
      );
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...listXmlAndXsdFiles(path, publicRoot, errors, reparseCache));
    } else if (entry.isFile() && /\.(?:xml|xsd)$/iu.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function hasSymbolicPathComponent(root, localPath, reparseCache) {
  let current = root;
  for (const segment of localPath.split("/")) {
    current = resolve(current, segment);
    if (!existsSync(current)) return false;
    if (isReparsePoint(current, reparseCache)) return true;
  }
  return false;
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
  const realPublicRoot = realpathSync(publicRoot);
  const realAllowedPrefix = `${realPublicRoot}${sep}`;
  const assetsById = new Map();
  const localPaths = new Set();
  const reparseCache = new Map();

  for (const asset of manifest.assets) {
    const id = typeof asset.id === "string" ? asset.id : "<missing-id>";
    if (assetsById.has(id)) errors.push(`${id}: duplicate asset ID`);
    assetsById.set(id, asset);

    if (typeof asset.localPath !== "string") {
      errors.push(`${id}: localPath is missing`);
      continue;
    }
    if (localPaths.has(asset.localPath)) {
      errors.push(`${id}: duplicate localPath ${asset.localPath}`);
    }
    localPaths.add(asset.localPath);

    const filePath = resolve(publicRoot, asset.localPath);
    if (!filePath.startsWith(allowedPrefix)) {
      errors.push(`${id}: localPath escapes public directory`);
      continue;
    }
    if (!existsSync(filePath)) {
      errors.push(`${id}: file is missing`);
      continue;
    }
    let hasReparseComponent;
    try {
      hasReparseComponent = hasSymbolicPathComponent(
        publicRoot,
        asset.localPath,
        reparseCache,
      );
    } catch (error) {
      errors.push(
        `${id}: cannot inspect localPath reparse status: ${String(error)}`,
      );
      continue;
    }
    if (hasReparseComponent) {
      errors.push(`${id}: symbolic link or reparse point in localPath`);
      continue;
    }
    const realFilePath = realpathSync(filePath);
    if (!realFilePath.startsWith(realAllowedPrefix)) {
      errors.push(`${id}: symbolic link or reparse point in localPath`);
      continue;
    }

    const bytes = readFileSync(realFilePath);
    if (bytes.length !== asset.bytes) {
      errors.push(
        `${id}: byte length mismatch (expected ${asset.bytes}, received ${bytes.length})`,
      );
    }
    if (sha256(bytes) !== asset.sha256) {
      errors.push(`${id}: SHA-256 mismatch`);
    }
  }

  const officialAssetsRoot = resolve(publicRoot, "official-assets");
  if (existsSync(officialAssetsRoot)) {
    for (const filePath of listXmlAndXsdFiles(
      officialAssetsRoot,
      publicRoot,
      errors,
      reparseCache,
    )) {
      const localPath = relative(publicRoot, filePath).split(sep).join("/");
      if (!localPaths.has(localPath)) {
        errors.push(`unlocked official asset: ${localPath}`);
      }
    }
  }

  for (const asset of manifest.assets) {
    if (asset.contentDuplicateOf === undefined) continue;

    const id = typeof asset.id === "string" ? asset.id : "<missing-id>";
    if (
      typeof asset.contentDuplicateOf !== "string" ||
      asset.contentDuplicateOf.length === 0
    ) {
      errors.push(`${id}: contentDuplicateOf must be a non-empty asset ID`);
      continue;
    }

    const target = assetsById.get(asset.contentDuplicateOf);
    if (!target) {
      errors.push(`${id}: contentDuplicateOf target is missing`);
      continue;
    }
    if (target === asset) {
      errors.push(`${id}: contentDuplicateOf cannot reference itself`);
      continue;
    }
    if (target.contentDuplicateOf !== undefined) {
      errors.push(`${id}: contentDuplicateOf must reference a canonical asset`);
      continue;
    }
    if (asset.bytes !== target.bytes || asset.sha256 !== target.sha256) {
      errors.push(
        `${id}: contentDuplicateOf ${asset.contentDuplicateOf} does not match bytes`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    checked: manifest.assets.length,
    errors,
  };
}
