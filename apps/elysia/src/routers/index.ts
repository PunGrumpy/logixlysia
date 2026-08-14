import { logixlysia } from "@pori15/logixlysia";
import Elysia from "elysia";
import { aiMetricsRouter } from "./ai-metrics";
import { boomRouter } from "./boom";
import { customRouter } from "./custom";
import { otelRouter } from "./otel";
import { pinoRouter } from "./pino";
import { requestContextRouter } from "./request-context";
import { statusRouter } from "./status";

export const routers = new Elysia()
  .use(logixlysia())
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
