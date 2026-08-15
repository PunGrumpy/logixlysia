import { describe, expectTypeOf, test } from "bun:test";
import { Elysia } from "elysia";
import { websocket } from "elysia/websocket";

import { createLogPlugin } from "../../src";

describe("createLogPlugin WebSocket typing (#220)", () => {
  test("infers plugin store on ws.data when .ws follows .use(createLogPlugin()) on a bare Elysia", () => {
    new Elysia()
      .use(websocket())
      .use(createLogPlugin())
      .ws("/", {
        open(ws) {
          expectTypeOf(ws.data.store.logger).toHaveProperty("log");
          expectTypeOf(ws.data.store.pino).not.toBeUndefined();
        },
      });
  });

  test("preserves parent store keys on ws.data after .use(createLogPlugin())", () => {
    new Elysia()
      .use(websocket())
      .state("marker", 42 as const)
      .use(createLogPlugin())
      .ws("/", {
        open(ws) {
          expectTypeOf(ws.data.store.marker).toEqualTypeOf<42>();
          expectTypeOf(ws.data.store.logger).toHaveProperty("log");
          expectTypeOf(ws.data.store.pino).not.toBeUndefined();
        },
      });
  });
});
