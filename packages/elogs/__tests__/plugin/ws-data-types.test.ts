import { describe, expectTypeOf, test } from "bun:test";
import { Elysia } from "elysia";
import { websocket } from "elysia/websocket";

import { createElogs } from "../../src";

describe("createElogs WebSocket typing (#220)", () => {
  test("infers plugin store on ws.data when .ws follows .use(createElogs()) on a bare Elysia", () => {
    new Elysia()
      .use(websocket())
      .use(createElogs())
      .ws("/", {
        open(ws) {
          expectTypeOf(ws.data.store.logger).toHaveProperty("log");
          expectTypeOf(ws.data.store.pino).not.toBeUndefined();
        },
      });
  });

  test("preserves parent store keys on ws.data after .use(createElogs())", () => {
    new Elysia()
      .use(websocket())
      .state("marker", 42 as const)
      .use(createElogs())
      .ws("/", {
        open(ws) {
          expectTypeOf(ws.data.store.marker).toEqualTypeOf<42>();
          expectTypeOf(ws.data.store.logger).toHaveProperty("log");
          expectTypeOf(ws.data.store.pino).not.toBeUndefined();
        },
      });
  });
});
