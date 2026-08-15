import { describe, expect, mock, test } from "bun:test";
import type { CreateElogsOptions } from "../../src/interfaces";
import { createLogger } from "../../src/logger";
import { spyConsole } from "../_helpers/console";
import { createMockRequest } from "../_helpers/request";

describe("createLogger", () => {
  test("returns a logger with expected methods", () => {
    const logger = createLogger();
    expect(logger.pino).toBeDefined();
    expect(typeof logger.log).toBe("function");
    expect(typeof logger.handleHttpError).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  test("respects transports.only and still calls transports", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      transports: {
        only: true,
        targets: [{ log: transport }],
      },
    };

    const { spies, restore } = spyConsole();

    const logger = createLogger(options);
    const request = createMockRequest("http://localhost/test");

    logger.info(request, "hello");

    // transport should be invoked synchronously
    expect(transport).toHaveBeenCalledTimes(1);
    const [firstCall, ...rest] = transport.mock.calls;
    expect(firstCall).toBeDefined();
    const [levelValue, messageValue] = firstCall ?? [undefined, undefined];
    expect(levelValue).toBe("INFO");
    expect(messageValue).toBe("hello");

    // internal console output should be disabled
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
    expect(spies.debug).not.toHaveBeenCalled();

    restore();

    // Avoid unhandled async noise if any transport returns a promise in future
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("handleHttpError emits transport error log", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      transports: {
        only: true,
        targets: [{ log: transport }],
      },
    };

    const logger = createLogger(options);
    const request = createMockRequest("http://localhost/test");
    const store = { beforeTime: BigInt(0) };

    const problemError = {
      message: "bad",
      name: "ProblemError",
      status: 400,
      title: "Bad Request",
      toJSON: () => ({
        message: "bad",
        status: 400,
        title: "Bad Request",
        type: "https://httpstatuses.com/400",
      }),
      type: "https://httpstatuses.com/400",
    };

    logger.handleHttpError(request, problemError, store, options);

    expect(transport).toHaveBeenCalledTimes(1);
    const [levelValue] = transport.mock.calls[0] ?? [undefined];
    expect(levelValue).toBe("WARNING");

    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
