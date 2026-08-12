/**
 * logixlysia 2.0 — 日志插件主入口
 *
 * 核心职责：为 Elysia 框架提供企业级日志能力
 *
 * 主要功能：
 * - ✅ 请求/响应自动日志记录
 * - ✅ 请求ID追踪（支持header传递）
 * - ✅ 性能计时（请求耗时统计）
 * - ✅ WebSocket日志支持
 * - ✅ 异步本地存储（深度调用链日志）
 * - ✅ 多种预设模式（dev/prod/json）
 *
 * 架构:
 * 主函数只负责**编排** —— 真正的"装钩子"逻辑都拆到 `build/*.ts` 里。
 *   createCore()        → 解析 options + 创建所有 per-instance 状态
 *   buildRequestHooks() → .state() + .request() + .afterHandle()
 *   buildStartupHook()  → .setup() 打 banner
 *   applyErrorLogging() → 4 层 .error() 注册(在 errors.ts)
 *   buildDeriveSlot()   → .derive() 挂 log
 *   createWsHandlerWrapper() → 额外提供 wrapWs 给 WS handler
 */

import { Elysia } from "elysia";
import { buildDeriveSlot } from "./build/build-derive-slot";
import { buildRequestHooks } from "./build/build-request-hooks";
import { buildStartupHook } from "./build/build-startup-hook";
import { createCore } from "./build/core";
import { applyErrorLogging } from "./errors";
import type { LogixlysiaOptions, LogixlysiaStore, RequestScopedLogger } from "./interfaces";
import { createWsHandlerWrapper } from "./websocket";

// ============================================================
// 1. 类型定义 - 描述插件对外暴露的能力
// ============================================================

/**
 * 空插槽类型 - Elysia 2 要求所有插槽必须是对象类型
 * 用空对象表示"这个槽位不暴露任何内容"
 */
export type EmptyElysiaSlot = Record<string, never>;

/**
 * 插件单例接口 - 定义插件注入到 Elysia 的内容
 */
export interface LogixlysiaSingleton {
  decorator: Record<string, unknown>;
  derive: { log: RequestScopedLogger };
  resolve: Record<string, never>;
  store: LogixlysiaStore;
}

/**
 * 完整插件类型 - 合并了 Elysia 和插件自定义能力
 */
export type Logixlysia = Elysia<"", "local", LogixlysiaSingleton>;

/**
 * 插件返回类型 - 包含 WebSocket 包装器
 */
export type LogixlysiaPlugin = Logixlysia & {
  wrapWs: ReturnType<typeof createWsHandlerWrapper>;
};

// ============================================================
// 2. 主函数 - 纯编排,具体钩子逻辑在 build/*.ts
// ============================================================

export const logixlysia = (options: LogixlysiaOptions = {}): LogixlysiaPlugin => {
  // 一次性创建所有 per-instance 状态,后续 builder 共享
  const core = createCore(options);

  // biome-ignore lint/suspicious/noExplicitAny: Elysia 2 的链式 API 泛型嵌套,builder 内部已做 cast
  let app: any = new Elysia({ name: "Logixlysia" });

  app = buildRequestHooks(app, core);
  app = buildStartupHook(app, core);
  app = applyErrorLogging(
    app,
    core.logger,
    core.resolvedOptions,
    core.didCustomLog,
    core.requestIdConfig?.header ?? "X-Request-Id"
  );
  app = buildDeriveSlot(app, core);

  // 把钩子应用到父 app 的所有路由(而不是仅本插件的路由)
  const plugin = (app as { as: (s: string) => Logixlysia }).as("global") as Logixlysia;

  // 附加 WebSocket 包装器
  const wrapWs = createWsHandlerWrapper(
    core.resolvedOptions,
    core.logger,
    core.contextStore
  );

  return Object.assign(plugin, { wrapWs }) as LogixlysiaPlugin;
};

export default logixlysia;
