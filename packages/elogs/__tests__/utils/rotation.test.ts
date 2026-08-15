import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import {
  getRotatedFiles,
  parseInterval,
  parseRetention,
  parseSize,
} from "../../src/utils/rotation";
import { createTempDir, removeTempDir } from "../_helpers/tmp";

const KB = 1024;
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 604_800_000;

describe("parseSize", () => {
  test("passes a plain number through", () => {
    expect(parseSize(1024)).toBe(1024);
  });

  test("parses a plain numeric string", () => {
    expect(parseSize("2048")).toBe(2048);
  });

  test("parses kilobyte forms", () => {
    expect(parseSize("10k")).toBe(10 * KB);
    expect(parseSize("10kb")).toBe(10 * KB);
  });

  test("parses megabyte forms", () => {
    expect(parseSize("1m")).toBe(1 * MB);
    expect(parseSize("1MB")).toBe(1 * MB);
  });

  test("parses gigabyte forms", () => {
    expect(parseSize("1g")).toBe(1 * GB);
  });

  test("parses fractional sizes", () => {
    expect(parseSize("1.5k")).toBe(1536);
  });

  test("throws on unparseable strings", () => {
    expect(() => parseSize("abc")).toThrow("Invalid size format");
    expect(() => parseSize("10x")).toThrow("Invalid size format");
  });

  test("rejects empty and negative string sizes", () => {
    expect(() => parseSize("")).toThrow("Invalid size");
    expect(() => parseSize("-5")).toThrow("Invalid size");
  });

  test("rejects zero, negative, and non-finite number sizes", () => {
    expect(() => parseSize(0)).toThrow("Invalid size");
    expect(() => parseSize(-1)).toThrow("Invalid size");
    expect(() => parseSize(Number.NaN)).toThrow("Invalid size");
  });
});

describe("parseInterval", () => {
  test("parses hours", () => {
    expect(parseInterval("1h")).toBe(HOUR_MS);
  });

  test("parses days", () => {
    expect(parseInterval("2d")).toBe(2 * DAY_MS);
  });

  test("parses weeks", () => {
    expect(parseInterval("1w")).toBe(WEEK_MS);
  });

  test("throws on invalid formats", () => {
    expect(() => parseInterval("1x")).toThrow("Invalid interval format");
    expect(() => parseInterval("")).toThrow("Invalid interval format");
    expect(() => parseInterval("h")).toThrow("Invalid interval format");
  });
});

describe("parseRetention", () => {
  test("treats a number as a count", () => {
    expect(parseRetention(5)).toEqual({ type: "count", value: 5 });
  });

  test("treats a string as a time interval", () => {
    expect(parseRetention("7d")).toEqual({ type: "time", value: 7 * DAY_MS });
  });
});

describe("getRotatedFiles", () => {
  test("returns only rotated sibling files", async () => {
    const dir = await createTempDir();
    try {
      const filePath = join(dir, "app.log");

      await fs.writeFile(filePath, "live");
      await fs.writeFile(`${filePath}.2026-01-02-03-04-05`, "a");
      await fs.writeFile(`${filePath}.2026-01-02-03-04-05-123-9999999`, "b");
      await fs.writeFile(`${filePath}.2026-01-02-03-04-05.gz`, "c");
      await fs.writeFile(`${filePath}.backup`, "d");

      const rotated = await getRotatedFiles(filePath);
      const names = rotated
        .map((p) => p.slice(dir.length + 1))
        .sort((a, b) => a.localeCompare(b));

      expect(names).toEqual(
        [
          "app.log.2026-01-02-03-04-05",
          "app.log.2026-01-02-03-04-05-123-9999999",
          "app.log.2026-01-02-03-04-05.gz",
        ].sort((a, b) => a.localeCompare(b))
      );
    } finally {
      await removeTempDir(dir);
    }
  });

  test("returns an empty array when the directory is missing", async () => {
    const rotated = await getRotatedFiles("/nonexistent-dir-xyz/app.log");
    expect(rotated).toEqual([]);
  });
});
