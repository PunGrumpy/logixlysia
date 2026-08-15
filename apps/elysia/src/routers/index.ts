import { createElogs, globalLogger } from "@pori15/elogs";
import Elysia, { t } from "elysia";
import { aiMetricsRouter } from "./ai-metrics";
import { boomRouter } from "./boom";
import { customRouter } from "./custom";
import { dbRouter } from "./db";
import { otelRouter } from "./otel";
import { pinoRouter } from "./pino";
import { requestContextRouter } from "./request-context";
import { statusRouter } from "./status";

export const routers = new Elysia()
  .use(
    createElogs({
      // 启用 Drizzle 错误自动翻译 —— 翻译结果决定日志级别
      autoTranslate: { db: "drizzle" },
      config: {
        customLogFormat:
          "🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}",
        logFilePath: "./logs/example.log",
        // logFilter: { level: ["ERROR", "WARNING"] },
        logRotation: {
          compress: true,
          interval: "1d",
          maxFiles: "7d",
          maxSize: "10m",
        },
        pino: { redact: ["password", "token", "apiKey"] },
        service: "my-api",
        showStartupMessage: true,
      },
      preset: "dev", // 'dev' | 'prod' | 'json',或自定义
    })
  )
  .get("/log", {}, ({ log }) => {
    console.log("Check console logs for log output");
    log.info("Hello from Elysia with Elogs");
    globalLogger.info("Hello from Elysia with Elogs");
  })
  .get(
    "/health",
    {
      body: t.Object({
        message: t.String(),
      }),
    },
    ({ body }) => ({
      message: body.message,
      status: "ok",
    })
  )
  .get(
    "/",
    {
      detail: {},
    },
    () => ({
      summary: "Welcome to Basic Elysia with Elogs",
    })
  )
  .use(customRouter)
  .use(requestContextRouter)
  .use(aiMetricsRouter)
  .use(otelRouter)
  .use(pinoRouter)
  .use(statusRouter)
  .use(boomRouter)
  .use(dbRouter);
