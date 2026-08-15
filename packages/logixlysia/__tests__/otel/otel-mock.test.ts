import { afterEach, describe, expect, mock, test } from "bun:test";

import { createLogger } from "../../src/logger";
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

describe("createLogPlugin/otel (mocked)", () => {
  afterEach(() => {
    // Reset the module-level cache so each test starts fresh
    __resetForTesting();
    getSpanMock.mockImplementation(() => ({
      spanContext: () => fakeSpanContext,
    }));
  });

  test("injects trace_id & span_id when OTel API returns an active span", async () => {
    // Reset cache so it re-resolves from the mock
    __resetForTesting();

    const logger = createLogger({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
      },
    });
    const request = new Request("http://localhost/");

    const result = await injectTraceContext(logger, request);

    expect(result).toEqual({
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId,
    });
    expect(logger.getContext(request)).toMatchObject({
      span_id: fakeSpanContext.spanId,
      trace_id: fakeSpanContext.traceId,
    });
  });

  test("returns undefined when getSpan returns no active span", async () => {
    __resetForTesting();
    getSpanMock.mockImplementation(() => undefined as any);

    const logger = createLogger({
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
      },
    });
    const request = new Request("http://localhost/");

    const result = await injectTraceContext(logger, request);

    expect(result).toBeUndefined();
    expect(logger.getContext(request)).toEqual({});
  });
});
