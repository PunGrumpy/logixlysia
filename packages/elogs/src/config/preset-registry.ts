/**
 * createElogs 2.0 — Preset 注册表
 *
 * 内置 `dev` / `prod` / `json` 在模块加载时自动注册。
 * 用户可以用 `registerPreset("staging", { ... })` 加自己的 preset。
 *
 * 设计取舍:
 * - module-level Map 简单直接,适合"插件全局一次"的场景。
 * - **不**支持 unregister —— 测试间状态泄漏用 `__resetForTesting()` 重置整个表。
 * - 重复注册同名 preset 直接 throw(防止 typo 静默覆盖)。
 * - preset 的 schema 跟 `ElogsConfig` 一致,不做轻量校验(让 `resolveOptions` 统一管)。
 */

import type { CreateElogsOptions } from "../interfaces";

/**
 * Preset 配置对象的类型别名(取 `CreateElogsOptions["config"]`)。
 *
 * @public
 */
export type PresetConfig = NonNullable<CreateElogsOptions["config"]>;

const registry = new Map<string, PresetConfig>();

/**
 * 注册一个用户 preset。重复同名 → 抛错。
 *
 * @example
 * ```ts
 * import { registerPreset } from "@pori15/elogs";
 *
 * registerPreset("staging", {
 *   pino: { prettyPrint: true },
 *   showContextTree: true,
 *   requestId: true,
 * });
 *
 * app.use(createElogs({ preset: "staging" }));
 * ```
 *
 * @public
 */
export const registerPreset = (name: string, defaults: PresetConfig): void => {
  if (registry.has(name)) {
    throw new Error(`createElogs: preset "${name}" already registered`);
  }
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("createElogs: preset name must be a non-empty string");
  }
  registry.set(name, defaults);
};

/**
 * 取一个 preset 的默认配置(不区分内置 / 用户注册)。
 * `resolveOptions` 在这一步查表。
 *
 * @internal
 */
export const getPresetDefaults = (name: string): PresetConfig | undefined =>
  registry.get(name);

/**
 * 列出当前所有已注册的 preset 名(用于调试 / `--help` 输出)。
 *
 * @internal
 */
export const listPresets = (): string[] => Array.from(registry.keys());

/**
 * 测试用 —— 重置整个 preset 注册表(连同内置 preset)。
 * 生产代码**不应**调用,会丢失 `dev` / `prod` / `json`。
 *
 * 注意命名:`__resetPresetRegistry` 而**不**是 `__resetForTesting` —— 跟
 * `otel.ts:__resetForTesting` 区分,避免 api-gen 生成的 barrel 里重复标识符。
 *
 * @internal
 */
export const __resetPresetRegistry = (): void => {
  registry.clear();
};

// ==========================================================
// 内置 preset —— 模块加载时一次性注册
// ==========================================================

const BUILTIN_PRESETS: Record<string, PresetConfig> = {
  dev: {
    pino: { prettyPrint: true },
    showContextTree: true,
    showStartupMessage: true,
    startupMessageFormat: "banner",
    useColors: true,
  },
  json: {
    pino: { prettyPrint: false },
    showContextTree: false,
    showStartupMessage: false,
    useColors: false,
  },
  prod: {
    autoRedact: true,
    pino: { prettyPrint: false },
    requestId: true,
    showContextTree: false,
    showStartupMessage: false,
    useColors: false,
  },
};

for (const [name, defaults] of Object.entries(BUILTIN_PRESETS)) {
  registry.set(name, defaults);
}
