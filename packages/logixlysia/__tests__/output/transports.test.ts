import { describe, expect, mock, test } from "bun:test";
import type { Transport } from "../../src/interfaces";
import { logToTransports } from "../../src/output";
import { createMockRequest } from "../_helpers/request";

describe("logToTransports", () => {
  test("calls all transports with level/message/meta", () => {
    const t1 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {
        /* noop */
      }
    );
    const t2 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {
        /* noop */
      }
    );

    const transports: Transport[] = [{ log: t1 }, { log: t2 }];

    const request = createMockRequest("http://localhost/hello");
    const store = { beforeTime: BigInt(0) };

    logToTransports({
      data: { message: "Test message", status: 200 },
      level: "INFO",
      request,
      store,
      transports,
    });

    expect(t1).toHaveBeenCalledTimes(1);
    expect(t2).toHaveBeenCalledTimes(1);

    const [firstCall] = t1.mock.calls;
    expect(firstCall).toBeDefined();
    const [levelValue, messageValue, metaValue] = firstCall ?? [
      undefined,
      undefined,
      undefined,
    ];
    expect(levelValue).toBe("INFO");
    expect(messageValue).toBe("Test message");
    expect(metaValue).toBeTypeOf("object");
    const meta = metaValue as unknown as Record<string, unknown>;
    // BigInt is not JSON-serializable, so the meta carries `durationMs`
    // (number) and `pathname` (string) instead of the raw `beforeTime`
    // BigInt from upstream main.
    expect(meta.durationMs).toBe(0);

    const req = meta.request as { method?: unknown; url?: unknown } | undefined;
    expect(req?.method).toBe("GET");
    expect(req?.url).toBe("http://localhost/hello");
  });

  test("never throws when a transport throws", () => {
    const throwing = mock<
      (lvl: unknown, msg: unknown, metaArg?: unknown) => void
    >(() => {
      throw new Error("boom");
    });

    const request = createMockRequest("http://localhost/throw");
    const store = { beforeTime: BigInt(0) };

    expect(() => {
      logToTransports({
        data: { message: "ignored" },
        level: "INFO",
        request,
        store,
        transports: [{ log: throwing }],
      });
    }).not.toThrow();
  });

  test("swallows async transport rejections", async () => {
    const rejecting = mock<
      (lvl: unknown, msg: unknown, metaArg?: unknown) => Promise<void>
    >(() => Promise.reject(new Error("nope")));

    const request = createMockRequest("http://localhost/reject");
    const store = { beforeTime: BigInt(0) };

    logToTransports({
      data: { message: "async" },
      level: "INFO",
      request,
      store,
      transports: [{ log: rejecting }],
    });

    // Let promise microtasks run; rejections should be caught internally.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rejecting).toHaveBeenCalledTimes(1);
  });
});
