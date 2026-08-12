/**
 * logixlysia 2.0 — 启动钩子构建器
 *
 * 职责:在 Elysia `.setup()` 钩子里打印启动 banner。
 * 端口/主机名从 Elysia server 拿,拿不到就退化到 `process.env.PORT` / `process.env.HOST`。
 *
 * Elysia 2 的 `.setup()` 等价于 1.x 的 `.onStart()`,但**不会**在单元测试的
 * 非 listen 场景触发,适合"应用真正起服务时再打 banner"。
 */

import { startServer } from "../extensions";
import type { LogixlysiaCore } from "./core";

// biome-ignore lint/suspicious/noExplicitAny: Elysia 2 的钩子签名泛型嵌套,这里需要显式放弃类型
type AnyApp = any;

export const buildStartupHook = (app: AnyApp, core: LogixlysiaCore): AnyApp => {
  return (app as {
    setup: (fn: (instance: unknown) => void) => AnyApp;
  }).setup((instance: unknown) => {
    const candidate = (instance as { server?: unknown }).server;
    let server: { port?: number; hostname?: string; protocol?: string | null };
    if (candidate && typeof candidate === "object") {
      server = candidate as typeof server;
    } else {
      const port = Number(process.env["PORT"]) || 3000;
      const hostname = process.env["HOST"] || "localhost";
      server = { hostname, port, protocol: "http" };
    }
    startServer(server, core.resolvedOptions);
  });
};
