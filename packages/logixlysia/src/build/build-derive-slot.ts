/**
 * logixlysia 2.0 — derive slot 构建器
 *
 * 职责:把 request-scoped logger 挂到 `({ log })` 上,让路由 handler 不必显式
 * 传 `Request` 参数就能 `log.info("...")`。
 *
 * 走的是 Elysia 2 自己的 derive 机制,不依赖 ALS —— 在深调用栈里也可靠
 * (Elysia 把 derive 的值塞进 context,跟着 hook chain 透传)。
 */

import { createRequestScopedLogger } from "../context/storage";
import type { RequestScopedLogger } from "../interfaces";
import type { LogixlysiaCore } from "./core";

// biome-ignore lint/suspicious/noExplicitAny: Elysia 2 的钩子签名泛型嵌套,这里需要显式放弃类型
type AnyApp = any;

export const buildDeriveSlot = (app: AnyApp, core: LogixlysiaCore): AnyApp => {
  return (app as {
    derive: <T extends Record<string, unknown>>(fn: (ctx: unknown) => T) => AnyApp;
  }).derive((ctx: unknown) => {
    const request = (ctx as { request?: Request }).request;
    if (!request) {
      return { log: undefined as unknown as RequestScopedLogger };
    }
    return {
      log: createRequestScopedLogger(core.logger, request, core.contextStore),
    };
  });
};
