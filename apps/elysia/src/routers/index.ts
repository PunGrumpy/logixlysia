import Elysia from "elysia";
import { logixlysia } from "@pori15/logixlysia";
import { boomRouter } from "./boom";
import { customRouter } from "./custom";
import { pinoRouter } from "./pino";
import { statusRouter } from "./status";
import { otelRouter } from "./otel";
import { aiMetricsRouter } from "./ai-metrics";
import { requestContextRouter } from "./request-context";


export const routers = new Elysia()
  .use(
    logixlysia()
  )
  .get(
    "/",
    {
      detail: {
        summary: "Welcome to Basic Elysia with Logixlysia",
        tags: ["welcome"],
      },
    },
    () => ({
      message: "Welcome to Basic Elysia with Logixlysia",
    })
  )
  .use(customRouter)
  .use(requestContextRouter)
  .use(aiMetricsRouter)
  .use(otelRouter)
  .use(pinoRouter)
  .use(statusRouter)
  .use(boomRouter);
