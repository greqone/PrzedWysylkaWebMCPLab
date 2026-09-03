import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const script = resolve(root, "scripts/artifact-digest.mjs");

function digestDirectory(path: string) {
  const result = spawnSync(process.execPath, [script, path], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    algorithm: string;
    sha256: string;
    fileCount: number;
    byteCount: number;
  };
}

describe("production artifact digest", () => {
  test("is independent of creation order and changes with file bytes", async () => {
    const scratch = await mkdtemp(resolve(tmpdir(), "przedwysylka-artifact-"));
    const first = resolve(scratch, "first");
    const second = resolve(scratch, "second");
    try {
      await mkdir(resolve(first, "nested"), { recursive: true });
      await writeFile(resolve(first, "z.txt"), "alpha");
      await writeFile(
        resolve(first, "nested/a.bin"),
        Buffer.from([0, 1, 2, 3]),
      );

      await mkdir(resolve(second, "nested"), { recursive: true });
      await writeFile(
        resolve(second, "nested/a.bin"),
        Buffer.from([0, 1, 2, 3]),
      );
      await writeFile(resolve(second, "z.txt"), "alpha");

      const firstDigest = digestDirectory(first);
      const secondDigest = digestDirectory(second);
      expect(firstDigest).toEqual(secondDigest);
      expect(firstDigest).toMatchObject({
        algorithm: "directory-sha256-v1",
        fileCount: 2,
        byteCount: 9,
      });
      expect(firstDigest.sha256).toMatch(/^[a-f0-9]{64}$/u);

      await writeFile(resolve(second, "z.txt"), "alphb");
      expect(digestDirectory(second).sha256).not.toBe(firstDigest.sha256);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
