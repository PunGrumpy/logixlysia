import { describe, expect, test } from "bun:test";

import { resolveOptions } from "../../src/config/resolve-options";

describe("resolveOptions", () => {
  test("prod preset enables autoRedact and disables banner", () => {
    const resolved = resolveOptions({ preset: "prod" });

    expect(resolved.config?.autoRedact).toBe(true);
    expect(resolved.config?.showStartupMessage).toBe(false);
    expect(resolved.config?.showContextTree).toBe(false);
  });

  test("explicit config overrides preset", () => {
    const resolved = resolveOptions({
      config: {
        autoRedact: false,
        showStartupMessage: true,
      },
      preset: "prod",
    });

    expect(resolved.config?.autoRedact).toBe(false);
    expect(resolved.config?.showStartupMessage).toBe(true);
  });

  test("dev preset enables pretty print", () => {
    const resolved = resolveOptions({ preset: "dev" });

    expect(resolved.config?.pino?.prettyPrint).toBe(true);
    expect(resolved.config?.showStartupMessage).toBe(true);
  });

  test("valid logRotation config passes through unchanged", () => {
    const resolved = resolveOptions({
      config: {
        logRotation: {
          compression: "gzip",
          interval: "1d",
          maxFiles: 5,
          maxSize: "10m",
        },
      },
    });

    expect(resolved.config?.logRotation).toEqual({
      compression: "gzip",
      interval: "1d",
      maxFiles: 5,
      maxSize: "10m",
    });
  });

  test("throws on an invalid logRotation.maxSize", () => {
    expect(() =>
      resolveOptions({ config: { logRotation: { maxSize: "" } } })
    ).toThrow("createElogs: invalid logRotation config");
  });

  test("throws on an invalid logRotation.interval", () => {
    expect(() =>
      resolveOptions({ config: { logRotation: { interval: "nope" } } })
    ).toThrow("createElogs: invalid logRotation config");
  });

  test("throws on an invalid logRotation.maxFiles", () => {
    expect(() =>
      resolveOptions({ config: { logRotation: { maxFiles: "nope" } } })
    ).toThrow("createElogs: invalid logRotation config");
  });

  test("throws on an invalid logRotation.compression", () => {
    expect(() =>
      resolveOptions({
        config: {
          logRotation: { compression: "brotli" as never },
        },
      })
    ).toThrow("createElogs: invalid logRotation config");
  });

  test("validates logRotation after preset merge", () => {
    expect(() =>
      resolveOptions({
        config: { logRotation: { maxSize: -5 } },
        preset: "prod",
      })
    ).toThrow("createElogs: invalid logRotation config");
  });

  test("throws on an unknown preset", () => {
    expect(() => resolveOptions({ preset: "staging" as never })).toThrow(
      "createElogs: invalid preset"
    );
  });
});
