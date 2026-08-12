import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import {
  getRotatedFileName,
  performRotation,
  shouldRotate,
} from "../../src/output/rotation-manager";
import { createTempDir, removeTempDir } from "../_helpers/tmp";

const DAY_MS = 86_400_000;

describe("getRotatedFileName", () => {
  test("formats a fixed date deterministically", () => {
    const date = new Date(2026, 0, 2, 3, 4, 5, 123);
    expect(getRotatedFileName("/tmp/app.log", date)).toBe(
      "/tmp/app.log.2026-01-02-03-04-05-123"
    );
  });
});

describe("shouldRotate", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  test("returns false when maxSize is undefined", async () => {
    const filePath = join(dir, "app.log");
    await fs.writeFile(filePath, "x".repeat(100));
    expect(await shouldRotate(filePath, {})).toBe(false);
  });

  test("returns true when the file exceeds maxSize", async () => {
    const filePath = join(dir, "app.log");
    await fs.writeFile(filePath, "x".repeat(100));
    expect(await shouldRotate(filePath, { maxSize: 10 })).toBe(true);
  });

  test("returns false when the file is smaller than maxSize", async () => {
    const filePath = join(dir, "app.log");
    await fs.writeFile(filePath, "x".repeat(10));
    expect(await shouldRotate(filePath, { maxSize: 1000 })).toBe(false);
  });
});

describe("performRotation retention", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  test("count retention keeps only the newest maxFiles rotated files", async () => {
    const filePath = join(dir, "app.log");
    await fs.writeFile(filePath, "live content");

    const now = Date.now();
    const rotatedPaths = [
      `${filePath}.2026-01-01-00-00-00-000`,
      `${filePath}.2026-01-02-00-00-00-000`,
      `${filePath}.2026-01-03-00-00-00-000`,
      `${filePath}.2026-01-04-00-00-00-000`,
    ];

    // Stagger mtimes: index 0 is oldest, index 3 is newest.
    await Promise.all(
      rotatedPaths.map(async (rotatedPath, index) => {
        await fs.writeFile(rotatedPath, `rotated-${index}`);
        const mtimeSeconds = now / 1000 - (rotatedPaths.length - index) * 60;
        await fs.utimes(rotatedPath, mtimeSeconds, mtimeSeconds);
      })
    );

    // performRotation rotates the live file first, producing a 5th rotated
    // file (the newest of all), then cleans up down to maxFiles.
    await performRotation(filePath, { maxFiles: 2 });

    const entries = await fs.readdir(dir);
    const remainingRotated = entries.filter((name) =>
      name.startsWith("app.log.")
    );

    expect(remainingRotated).toHaveLength(2);
    // The two oldest pre-existing rotated files must be gone.
    expect(remainingRotated).not.toContain("app.log.2026-01-01-00-00-00-000");
    expect(remainingRotated).not.toContain("app.log.2026-01-02-00-00-00-000");
    // The newest pre-existing rotated file survives.
    expect(remainingRotated).toContain("app.log.2026-01-04-00-00-00-000");
  });

  test("time retention deletes only files older than the retention window", async () => {
    const filePath = join(dir, "app.log");
    await fs.writeFile(filePath, "live content");

    const now = Date.now();
    const oldPath = `${filePath}.2020-01-01-00-00-00-000`;
    const recentPath = `${filePath}.2026-01-01-00-00-00-000`;

    await fs.writeFile(oldPath, "old");
    await fs.writeFile(recentPath, "recent");

    const oldMtimeSeconds = (now - 10 * DAY_MS) / 1000;
    const recentMtimeSeconds = (now - 1000) / 1000;
    await fs.utimes(oldPath, oldMtimeSeconds, oldMtimeSeconds);
    await fs.utimes(recentPath, recentMtimeSeconds, recentMtimeSeconds);

    await performRotation(filePath, { maxFiles: "7d" });

    const entries = await fs.readdir(dir);
    expect(entries).not.toContain("app.log.2020-01-01-00-00-00-000");
    expect(entries).toContain("app.log.2026-01-01-00-00-00-000");
  });

  test("is a no-op for an empty live file", async () => {
    const filePath = join(dir, "app.log");
    await fs.writeFile(filePath, "");

    await performRotation(filePath, { maxFiles: 2 });

    const entries = await fs.readdir(dir);
    expect(entries).toEqual(["app.log"]);
    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(0);
  });
});
