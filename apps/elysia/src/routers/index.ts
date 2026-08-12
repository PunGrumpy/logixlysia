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
    logixlysia({
      config: {
        timestamp: {
          translateTime: "yyyy-mm-dd HH:MM:ss",
        },
        customLogFormat:
          "🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {context}",
        logFilePath: "./logs/example.log",
        ip: true,
      },
    })
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
