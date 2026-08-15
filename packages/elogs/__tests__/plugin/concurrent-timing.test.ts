import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { createElogs } from "../../src";
import type { CreateElogsOptions } from "../../src/interfaces";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("createElogs plugin - per-request timing under concurrency", () => {
  test("overlapping requests report independent, correct durations", async () => {
    const calls: { url: string; durationMs: number }[] = [];
    const transport = (
      _level: unknown,
      _message: unknown,
      meta?: unknown
    ): void => {
      const record = meta as { request: { url: string }; durationMs: number };
      calls.push({
        durationMs: record.durationMs,
        url: record.request.url,
      });
    };

    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia()
      .use(createElogs(options))
      .get("/slow", async () => {
        await sleep(120);
        return "slow";
      })
      .get("/fast", () => "fast");

    const slowPromise = app.handle(new Request("http://localhost/slow"));
    await sleep(30);
    await app.handle(new Request("http://localhost/fast"));
    await slowPromise;

    const durationFor = (path: string): number => {
      const call = calls.find((c) => c.url.endsWith(path));
      if (!call) {
        throw new Error(`no transport call recorded for ${path}`);
      }
      return call.durationMs;
    };

    const slowDurationMs = durationFor("/slow");
    const fastDurationMs = durationFor("/fast");

    // Pre-fix, the request start time was mutated in Elysia's app-global
    // state: the `/fast` request (started ~30ms after `/slow`) overwrites the
    // single shared slot before `/slow`'s `onAfterHandle` reads it, so
    // `/slow`'s logged duration collapses to roughly `120 - 30 = 90ms`
    // instead of reflecting its true ~120ms runtime.
    expect(slowDurationMs).toBeGreaterThanOrEqual(100);
    expect(fastDurationMs).toBeLessThan(100);
  });
});
