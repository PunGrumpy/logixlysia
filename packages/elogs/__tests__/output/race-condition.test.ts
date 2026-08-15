import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { CreateElogsOptions } from "../../src/interfaces";
import { logToFile } from "../../src/output/file";
import { createMockRequest } from "../_helpers/request";
import { createTempDir, removeTempDir } from "../_helpers/tmp";

const MESSAGE_REGEX = /message-(\d+)/;
// A full-line regex: a torn line (cut mid-write) or a merged line (two
// writes concatenated without a newline in between) will not match this
// anchored pattern, revealing broken mutual exclusion.
const EXCLUSION_LINE_REGEX =
  /^(DEBUG|INFO|WARNING|ERROR) [\d.]+ms GET \/test\d+ msg-(\d+)-x+$/;

describe("logToFile race condition", () => {
  test("handles concurrent writes during rotation without data loss", async () => {
    const dir = await createTempDir();
    try {
      const filePath = join(dir, "logs", "concurrent.log");
      const options: CreateElogsOptions = {
        config: {
          // Very small size to trigger rotation quickly
          logRotation: { compress: false, maxSize: 100 },
        },
      };

      // Create 50 concurrent write operations
      const writes = Array.from({ length: 50 }, (_, i) =>
        logToFile({
          data: { message: `message-${i}-${"x".repeat(20)}` },
          filePath,
          level: "INFO",
          options,
          request: createMockRequest(`http://localhost/test${i}`),
          store: { beforeTime: BigInt(0) },
        })
      );

      // Wait for all writes to complete
      await Promise.all(writes);

      // Read all log files (original + rotated)
      const files = await fs.readdir(join(dir, "logs"));
      const logFiles = files.filter(
        (name) =>
          name === "concurrent.log" || name.startsWith("concurrent.log.")
      );

      let totalLines = 0;
      const allMessages = new Set<string>();

      const contents = await Promise.all(
        logFiles.map((file) => fs.readFile(join(dir, "logs", file), "utf-8"))
      );
      for (const content of contents) {
        const lines = content.split("\n").filter((l) => l.length > 0);
        totalLines += lines.length;

        // Extract message numbers from each line
        for (const line of lines) {
          const match = line.match(MESSAGE_REGEX);
          if (match) {
            allMessages.add(match[1]);
          }
        }
      }

      // All 50 messages should be present (no data loss)
      expect(allMessages.size).toBe(50);
      expect(totalLines).toBe(50);

      // Verify all message IDs from 0-49 are present
      for (let i = 0; i < 50; i += 1) {
        expect(allMessages.has(String(i))).toBe(true);
      }
    } finally {
      await removeTempDir(dir);
    }
  });

  test("serializes rotation operations to prevent file conflicts", async () => {
    const dir = await createTempDir();
    try {
      const filePath = join(dir, "logs", "serialize.log");
      const options: CreateElogsOptions = {
        config: {
          // Trigger rotation on every write
          logRotation: { compress: false, maxSize: 1 },
        },
      };

      // Create 20 writes that should all trigger rotation
      const writes = Array.from({ length: 20 }, (_, i) =>
        logToFile({
          data: { message: `msg-${i}-${"x".repeat(100)}` },
          filePath,
          level: "INFO",
          options,
          request: createMockRequest(`http://localhost/test${i}`),
          store: { beforeTime: BigInt(0) },
        })
      );

      // This should not throw errors or lose data
      await expect(Promise.all(writes)).resolves.toBeDefined();

      // Count total log entries across all files
      const files = await fs.readdir(join(dir, "logs"));
      let totalEntries = 0;

      const contents = await Promise.all(
        files.map((file) => fs.readFile(join(dir, "logs", file), "utf-8"))
      );
      for (const content of contents) {
        const lines = content.split("\n").filter((l) => l.length > 0);
        totalEntries += lines.length;
      }

      // All 20 entries should be preserved
      expect(totalEntries).toBe(20);
    } finally {
      await removeTempDir(dir);
    }
  });

  test("same-tick logToFile calls to one path never interleave writes", async () => {
    const dir = await createTempDir();
    try {
      const filePath = join(dir, "logs", "exclusion.log");
      const options: CreateElogsOptions = {
        config: {
          // Rotate on every write so the critical section races with rotation
          logRotation: { compress: false, maxSize: 1 },
        },
      };

      const total = 20;

      // Fire all calls in the same tick (no awaits between them) so any
      // caller that fails to see a same-tick prior lock is exposed.
      const writes = Array.from({ length: total }, (_, i) =>
        logToFile({
          data: { message: `msg-${i}-${"x".repeat(50)}` },
          filePath,
          level: "INFO",
          options,
          request: createMockRequest(`http://localhost/test${i}`),
          store: { beforeTime: BigInt(0) },
        })
      );

      await Promise.all(writes);

      const files = await fs.readdir(join(dir, "logs"));
      const logFiles = files.filter(
        (name) => name === "exclusion.log" || name.startsWith("exclusion.log.")
      );

      let totalLines = 0;
      const seenIds = new Set<string>();

      const contents = await Promise.all(
        logFiles.map((file) => fs.readFile(join(dir, "logs", file), "utf-8"))
      );
      for (const content of contents) {
        const lines = content.split("\n").filter((l) => l.length > 0);
        totalLines += lines.length;

        for (const line of lines) {
          // Every line must be a single, complete, well-formed entry.
          expect(line).toMatch(EXCLUSION_LINE_REGEX);
          const match = line.match(EXCLUSION_LINE_REGEX);
          if (match) {
            seenIds.add(match[2]);
          }
        }
      }

      // No lines dropped or torn: exactly `total` distinct, well-formed lines.
      expect(totalLines).toBe(total);
      expect(seenIds.size).toBe(total);
    } finally {
      await removeTempDir(dir);
    }
  });
});
