import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ALGORITHM = "directory-sha256-v1";

export async function hashDirectory(directory) {
  const root = resolve(directory);
  const files = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(root, absolutePath).split(sep).join("/"),
        });
      } else {
        throw new Error(`Unsupported artifact entry: ${absolutePath}`);
      }
    }
  }

  await walk(root);
  files.sort((left, right) =>
    left.relativePath < right.relativePath
      ? -1
      : left.relativePath > right.relativePath
        ? 1
        : 0,
  );

  const hash = createHash("sha256").update(`${ALGORITHM}\0`);
  let byteCount = 0;
  for (const file of files) {
    const pathBytes = Buffer.from(file.relativePath, "utf8");
    const contents = await readFile(file.absolutePath);
    byteCount += contents.length;
    hash.update(`${pathBytes.length}:`);
    hash.update(pathBytes);
    hash.update(`:${contents.length}:`);
    hash.update(contents);
  }

  return {
    algorithm: ALGORITHM,
    sha256: hash.digest("hex"),
    fileCount: files.length,
    byteCount,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (!directory) {
    console.error("Usage: node scripts/artifact-digest.mjs <directory>");
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(await hashDirectory(directory)));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
