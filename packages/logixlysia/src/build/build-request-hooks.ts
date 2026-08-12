/**
 * logixlysia 2.0 — 请求 / 响应钩子构建器
 *
 * 职责:
 * - .state() 注册 logger / pino / beforeTime / pathname
 * - .request()  记录开始时间 + 解析 pathname + 生成 requestId + ALS enterWith
 * - .afterHandle() 回写 requestId header + 写 access log + 清理 per-request 状态
 *
 * 这是插件中**最重**的一段(原来直接堆在主函数 5.2 节,88 行),
 * 抽出来后主函数只看到一行 `buildRequestHooks(app, core)`。
 */

import {
  createRequestScopedLogger,
  loggerStorage,
} from "../context/storage";
import { getOrCreateRequestId } from "../middleware/request-id";
import type { LogixlysiaCore } from "./core";

/**
 * 我们必须 cast Elysia 2 的类型,因为 Elysia 2 的 `.request` / `.afterHandle` /
 * `.state` 等钩子签名是泛型嵌套的,公开类型没有把它们完整暴露。
 * 用 `any` 显式放弃 Elysia 自身的强类型 —— 行为在集成测试里覆盖
 * (apps/elysia/src/routers/*),不靠编译期类型保证。
 */
// biome-ignore lint/suspicious/noExplicitAny: Elysia 2 的钩子签名泛型嵌套,这里需要显式放弃类型
type AnyApp = any;

export const buildRequestHooks = (app: AnyApp, core: LogixlysiaCore): AnyApp => {
  const { logger, contextStore, requestStartTimes, requestIdConfig, useALS } = core;

  return (app as {
    state: (key: string, value: unknown) => AnyApp;
    request: (fn: (ctx: unknown) => void) => AnyApp;
    afterHandle: (fn: (ctx: unknown) => void | Response | unknown) => AnyApp;
  })
    .state("logger", logger)
    .state("pino", logger.pino)
    .state("beforeTime", BigInt(0))
    .state("pathname", "")
    .request((ctx: unknown) => {
      const { request, store } = ctx as { request: Request; store: unknown };
      // 记录请求开始时间(WeakMap 是 per-request 安全的,并发不会串扰)
      const now = process.hrtime.bigint();
      requestStartTimes.set(request, now);

      // 兼容老版本:把 beforeTime / pathname 也写到 Elysia store
      const storeObj = store as { beforeTime: bigint; pathname: string };
      storeObj.beforeTime = now;
      try {
        storeObj.pathname = new URL(request.url).pathname;
      } catch {
        storeObj.pathname = "/";
      }

      // 生成/提取请求 ID
      if (requestIdConfig) {
        const id = getOrCreateRequestId(request, requestIdConfig);
        contextStore.mergeContext(request, { requestId: id });
      }

      // 如果启用 ALS,进入异步本地存储作用域
      //
      // Elysia 2 内部对每个请求会包一层自己的 `als.run()` scope(用来传递
      // request / store / derive 的值)。我们的 `.request()` 钩子是在那个
      // scope 内被回调的,所以这里 `enterWith` 设进去的值,会**透传**到后续
      // 的路由 handler / `.afterHandle()`,只要 Elysia 自己在它们之间不再
      // 重新起一个 `als.run()`(目前 Elysia 2.x 不会,但升级时要注意)。
      //
      // 取舍:我们没法在 Elysia 自己的 async 上下文之外拦截请求,所以**无法**
      // 用 `loggerStorage.run()` 把整个请求包起来 —— 那是 Elysia 才能做的
      // 事。一旦 Elysia 之后在内部多次 `als.run()`,这个 `enterWith` 就会被
      // 切断,`useLogger()` 在深调用栈里会回到 NOOP_LOGGER。
      //
      // 推荐用法:深调用栈优先用 `({ log })` 的 derive(它走 Elysia 自己的
      // context 机制,不依赖 ALS),`useLogger()` 仅用于"想拿到 logger 但
      // 不想在签名里穿 ctx"的简单场景。
      if (useALS) {
        loggerStorage.enterWith(
          createRequestScopedLogger(logger, request, contextStore)
        );
      }
    })
    .afterHandle((ctx: unknown) => {
      const { request, set, store } = ctx as {
        request: Request;
        set: { status?: number; headers?: Record<string, string> };
        store: unknown;
      };

      // 回写 requestId header
      if (requestIdConfig) {
        const id = contextStore.getContext(request).requestId as
          | string
          | undefined;
        if (id) {
          set.headers = { ...(set.headers ?? {}), [requestIdConfig.header]: id };
        }
      }

      // 如果已自定义记录,跳过自动 access log
      if (core.didCustomLog.has(request)) {
        return;
      }

      // 根据状态码确定日志级别
      const status = typeof set.status === "number" ? set.status : 200;
      let level: "INFO" | "WARNING" | "ERROR" = "INFO";
      if (status >= 500) {
        level = "ERROR";
      } else if (status >= 400) {
        level = "WARNING";
      }

      // 构造带开始时间的合成 store(避免并发串扰)
      const beforeTime = requestStartTimes.get(request) ?? BigInt(0);
      const pathname =
        (store as { pathname?: string }).pathname ||
        (() => {
          try {
            return new URL(request.url).pathname;
          } catch {
            return "/";
          }
        })();
      const syntheticStore = {
        ...(store as object),
        beforeTime,
        pathname,
      } as Parameters<typeof logger.log>[3];

      logger.log(level, request, { status }, syntheticStore);

      // 清理 per-request 状态,防止内存泄漏
      requestStartTimes.delete(request);
      contextStore.clearContext(request);
    });
};
