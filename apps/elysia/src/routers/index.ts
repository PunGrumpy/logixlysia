import Elysia from "elysia";
import { logixlysia } from "logixlysia";

import { boomRouter } from "./boom";
import { customRouter } from "./custom";
import { pinoRouter } from "./pino";
import { statusRouter } from "./status";

export const routers = new Elysia()
  .use(
    logixlysia({
      config: {
        customLogFormat:
          "🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {context}",
        ip: true,
        logFilePath: "./logs/example.log",
        timestamp: {
          translateTime: "yyyy-mm-dd HH:MM:ss",
        },
      },
    })
  )
  .get(
    "/",
    () => ({
      message: "Welcome to Basic Elysia with Logixlysia",
    }),
    {
      detail: {
        summary: "Welcome to Basic Elysia with Logixlysia",
        tags: ["welcome"],
      },
    }
  )
  .use(customRouter)
  .use(pinoRouter)
  .use(statusRouter)
  .use(boomRouter);
