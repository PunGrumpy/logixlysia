/**
 * 全局 Logger 实例管理
 *
 * 负责创建和管理全局唯一的 Logger 实例，供整个应用使用。
 * 在插件初始化时设置，在任何地方都可以直接使用。
 *
 * @example
 * // 在任意文件中使用
 * import { globalLogger } from 'createLogPlugin';
 *
 * globalLogger.info('Hello world');
 * globalLogger.debug(request, 'Request processing', { userId: 123 });
 */

import { createRequestContextStore } from "./context/request-context";
import type { CreateLogPluginOptions, Logger } from "./interfaces";
import { createLogger } from "./logger";

/**
 * 全局 Logger 实例
 * 在插件初始化时设置，之后可直接使用
 */
export let globalLogger: Logger;

/**
 * 全局请求上下文存储
 * 用于在全局 Logger 中关联请求上下文
 */
export const globalContextStore = createRequestContextStore();

/**
 * 初始化全局 Logger
 * 在插件安装时调用，确保只初始化一次
 *
 * @param options - Logger 配置选项
 * @param contextStore - 可选的上下文存储实例
 * @returns 初始化后的 Logger 实例
 */
export const initGlobalLogger = (
  options: CreateLogPluginOptions = {},
  contextStore = globalContextStore
): Logger => {
  // 如果已经初始化，返回已有的实例
  if (globalLogger) {
    console.warn("Global logger already initialized, skipping re-init");
    return globalLogger;
  }

  // 创建 Logger 实例
  const logger = createLogger(options, undefined, contextStore);
  globalLogger = logger;

  return logger;
};

/**
 * 检查全局 Logger 是否已初始化
 */
export const isGlobalLoggerInitialized = (): boolean =>
  globalLogger !== undefined;

/**
 * 重置全局 Logger（主要用于测试）
 */
export const resetGlobalLogger = (): void => {
  globalLogger = undefined as any;
};

/**
 * 获取全局 Logger，如果未初始化则抛出错误
 */
export const getGlobalLogger = (): Logger => {
  if (!globalLogger) {
    throw new Error(
      "Global logger not initialized. Please ensure createLogPlugin is used before accessing globalLogger."
    );
  }
  return globalLogger;
};
