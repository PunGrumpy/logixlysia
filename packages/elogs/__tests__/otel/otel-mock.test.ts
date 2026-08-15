import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { requestStorage } from "../../src/context/storage";
import {
  globalLogger,
  initGlobalLogger,
  resetGlobalLogger,
} from "../../src/global-logger";
import { __resetForTesting, injectTraceContext } from "../../src/otel";

const fakeSpanContext = {
  spanId: "0123456789abcdef",
  traceId: "abc123def456789012345678abcdef01",
};

const getSpanMock = mock(() => ({
  spanContext: () => fakeSpanContext,
}));

// Mock @opentelemetry/api so that createRequire('...')('@opentelemetry/api')
// resolves to our fake API.
mock.module("@opentelemetry/api", () => ({
  context: { active: () => ({}) },
  trace: { getSpan: getSpanMock },
}));

describe("createElogs/otel (mocked)", () => {
  beforeEach(() => {
    resetGlobalLogger();
    initGlobalLogger({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
      },
    });
  });

  afterEach(() => {
    // Reset the module-level cache so each test starts fresh
    __resetForTesting();
    resetGlobalLogger();
    getSpanMock.mockImplementation(() => ({
      spanContext: () => fakeSpanContext,
    }));
  });

  test("injects trace_id & span_id when OTel API returns an active span", async () => {
    // Reset cache so it re-resolves from the mock
    __resetForTesting();

    const request = new Request("http://localhost/");

    const result = await requestStorage.run(request, () =>
      injectTraceContext(globalLogger)
    );

    expect(result).toEqual({
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId,
    });
    expect(
      requestStorage.run(request, () => globalLogger.getContext())
    ).toMatchObject({
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId,
    });
  });

  test("returns undefined when getSpan returns no active span", async () => {
    __resetForTesting();
    getSpanMock.mockImplementation(() => undefined as any);

    const request = new Request("http://localhost/");

    const result = await requestStorage.run(request, () =>
      injectTraceContext(globalLogger)
    );

    expect(result).toBeUndefined();
    expect(
      requestStorage.run(request, () => globalLogger.getContext())
    ).toEqual({});
  });
});
