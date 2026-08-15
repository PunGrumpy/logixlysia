/**
 * ============================================================
 * 模块：PII（个人身份信息）脱敏/红action模块
 * ============================================================
 *
 * 功能：在日志记录前自动识别并隐藏敏感信息
 * - 邮箱、IP地址、信用卡号、JWT令牌
 * - 敏感Header字段（Authorization、Cookie等）
 * - 支持深度对象脱敏和循环引用保护
 * - 专门针对HTTP Request对象的脱敏处理
 *
 * 遵循规范：GDPR、PCI-DSS等数据保护法规
 * ============================================================
 */

// ============================================================
// 1. 正则表达式定义 - 识别各类敏感信息模式
// ============================================================

/**
 * 邮箱正则
 * - 本地部分 ≤64字符
 * - 域名部分 ≤253字符
 * - TLD（顶级域）2-63字符
 * - 符合RFC 5321/1035标准，限制长度防止ReDoS攻击
 */
const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}/g;

/**
 * IPv4地址正则
 * 匹配格式：xxx.xxx.xxx.xxx（每个部分1-3位数字）
 */
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/**
 * 信用卡号候选正则
 * 匹配13-19位数字（可包含空格或短横线）
 * 实际验证通过Luhn算法完成
 */
const CREDIT_CARD_CANDIDATE_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * JWT令牌正则
 * 格式：header.payload.signature（三段Base64编码）
 * 以"eyJ"开头标识JSON Web Token
 */
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;

// ============================================================
// 2. 常量定义
// ============================================================

/** 信用卡号最小长度（含校验位） */
const PAN_MIN_LEN = 13;

/** 信用卡号最大长度（含校验位） */
const PAN_MAX_LEN = 19;

/** 脱敏后的替换文本 */
const REDACTED_TEXT = "[REDACTED]";

/** 循环引用的标识文本 */
const CIRCULAR_REF = "[Circular]";

/**
 * 默认敏感字段列表（不区分大小写）
 * 这些字段名的值将被自动脱敏
 * @internal
 */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  // 认证相关
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "token",
  "access-token",
  "refresh-token",
  "id-token",

  // 会话相关
  "cookie",
  "set-cookie",
  "session",
  "session-id",

  // 密码/密钥
  "password",
  "passwd",
  "secret",
  "client-secret",
  "private-key",

  // 支付信息
  "credit-card",
  "card-number",
  "cvv",
  "ssn", // 社保号
];

// ============================================================
// 3. 工具函数 - 字段名标准化
// ============================================================

/** 驼峰转短横线：用于匹配变体命名 */
const CAMEL_CASE_BOUNDARY_REGEX = /([a-z0-9])([A-Z])/g;

/**
 * 标准化字段名
 * 将各种变体统一转换为短横线分隔的小写形式
 *
 * @example
 * normalizeKeyName("X_Api-Key")   // → "x-api-key"
 * normalizeKeyName("apiKey")     // → "api-key"
 * normalizeKeyName("API_KEY")    // → "api-key"
 */
const normalizeKeyName = (key: string): string =>
  key
    .replace(CAMEL_CASE_BOUNDARY_REGEX, "$1-$2") // 驼峰转短横线
    .replaceAll("_", "-") // 下划线转短横线
    .toLowerCase(); // 转小写

// ============================================================
// 4. 敏感字段判断
// ============================================================

/**
 * 判断字段是否为敏感字段
 * @param key - 字段名
 * @param extraKeys - 用户自定义敏感字段列表
 * @returns 是否为敏感字段
 * @internal
 */
export const isSensitiveKey = (
  key: string,
  extraKeys?: readonly string[]
): boolean => {
  const normalized = normalizeKeyName(key);

  // 检查默认敏感字段列表
  if (DEFAULT_REDACT_KEYS.includes(normalized)) {
    return true;
  }

  // 检查用户自定义敏感字段列表
  return (
    extraKeys?.some((extraKey) => normalizeKeyName(extraKey) === normalized) ??
    false
  );
};

// ============================================================
// 5. Pino日志框架的脱敏路径生成
// ============================================================

/**
 * 为Pino日志框架生成脱敏路径
 * 支持一层嵌套：顶级和通配符路径
 *
 * @param extraKeys - 用户自定义敏感字段
 * @returns Pino支持的路径数组
 *
 * @example
 * buildPinoRedactPaths(["api-key"])
 * // → ['api-key', '*.api-key', '["api-key"]', '*["api-key"]']
 * @internal
 */
export const buildPinoRedactPaths = (
  extraKeys?: readonly string[]
): string[] => {
  const keys = [...DEFAULT_REDACT_KEYS, ...(extraKeys ?? [])];
  return keys.flatMap((key) => {
    // 包含短横线的字段需要用方括号引用
    if (key.includes("-")) {
      return [`["${key}"]`, `*["${key}"]`];
    }
    return [key, `*.${key}`];
  });
};

// ============================================================
// 6. URL脱敏处理
// ============================================================

/**
 * URL安全脱敏文本
 * 不能用 [REDACTED] 因为 '[' 会被解析为IPv6字面量，破坏URL解析
 */
const URL_SAFE_REDACT = "redacted";

/**
 * 对URL中的认证信息进行脱敏
 * 确保脱敏后URL仍然可被URL/Request构造函数解析
 */
const redactUrlAuthoritySegment = (value: string): string =>
  redactString(value).replaceAll(REDACTED_TEXT, URL_SAFE_REDACT);

/**
 * 对请求URL进行脱敏处理
 * 处理：用户名、密码、主机名、路径、查询参数、哈希值
 */
const redactRequestUrl = (urlString: string): string => {
  try {
    const u = new URL(urlString);

    // 脱敏用户名
    if (u.username !== "") {
      u.username = redactUrlAuthoritySegment(u.username);
    }

    // 脱敏密码
    if (u.password !== "") {
      u.password = redactUrlAuthoritySegment(u.password);
    }

    // 脱敏主机名
    u.hostname = redactUrlAuthoritySegment(u.hostname);

    // 脱敏路径
    u.pathname = redactString(u.pathname);

    // 脱敏查询参数
    u.search = redactString(u.search);

    // 脱敏哈希值
    u.hash = redactString(u.hash);

    return u.toString();
  } catch {
    // URL解析失败时降级处理
    return redactString(urlString).replaceAll(REDACTED_TEXT, URL_SAFE_REDACT);
  }
};

// ============================================================
// 7. 信用卡号验证（Luhn算法）
// ============================================================

/**
 * Luhn算法验证信用卡号
 * 用于确认数字串是否为有效的信用卡号，避免误杀
 *
 * @param digits - 纯数字字符串（无空格/横线）
 * @returns 是否通过Luhn校验
 *
 * @example
 * passesLuhn("4532015112830366")  // → true（Visa测试卡）
 * passesLuhn("1234567890123456")  // → false（无效卡号）
 */
const passesLuhn = (digits: string): boolean => {
  // 长度必须在13-19位之间
  if (digits.length < PAN_MIN_LEN || digits.length > PAN_MAX_LEN) {
    return false;
  }

  let sum = 0;
  let alternate = false;

  // 从右向左遍历
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const code = digits.charCodeAt(i);

    // 检查是否为数字字符
    if (code < 48 || code > 57) {
      return false;
    }

    let n = code - 48;

    // 每隔一位乘以2
    if (alternate) {
      n *= 2;
      if (n > 9) {
        n -= 9; // 两位数减9（等同于各位相加）
      }
    }

    sum += n;
    alternate = !alternate;
  }

  // 校验和应为10的倍数
  return sum % 10 === 0;
};

/**
 * 脱敏文本中的信用卡号候选
 * 先匹配可能的卡号格式，再通过Luhn算法验证
 */
const redactCreditCardCandidates = (text: string): string =>
  text.replace(CREDIT_CARD_CANDIDATE_REGEX, (match) => {
    // 移除空格和短横线
    const digits = match.replace(/\D/g, "");

    // 验证长度和Luhn算法
    if (
      digits.length >= PAN_MIN_LEN &&
      digits.length <= PAN_MAX_LEN &&
      passesLuhn(digits)
    ) {
      return REDACTED_TEXT;
    }
    return match;
  });

// ============================================================
// 8. 字符串脱敏
// ============================================================

/**
 * 对字符串进行全面的PII脱敏
 * 同时处理：邮箱、IP、信用卡号、JWT令牌
 * @internal
 * @param text - 原始文本
 * @returns 脱敏后的文本
 */
export const redactString = (text: string): string => {
  let result = text;

  // 脱敏邮箱
  result = result.replace(EMAIL_REGEX, REDACTED_TEXT);

  // 脱敏IP地址
  result = result.replace(IPV4_REGEX, REDACTED_TEXT);

  // 脱敏信用卡号
  result = redactCreditCardCandidates(result);

  // 脱敏JWT令牌
  result = result.replace(JWT_REGEX, REDACTED_TEXT);

  return result;
};

// ============================================================
// 9. 深度对象脱敏核心函数
// ============================================================

/**
 * 脱敏Error对象
 * 保留原型链，脱敏message、stack和自定义属性
 */
const redactErrorClone = (
  originalError: Error,
  inProgress: WeakSet<object>, // 循环引用检测
  extraKeys?: readonly string[] // 用户自定义敏感字段
): Error & Record<string, unknown> => {
  // 脱敏错误消息
  const redactedMessage = redactString(originalError.message);

  // 保留原型链
  const proto = Object.getPrototypeOf(originalError) as object;
  const newError = Object.create(proto) as Error & Record<string, unknown>;

  newError.message = redactedMessage;
  newError.name = originalError.name;

  // 脱敏堆栈信息
  if (originalError.stack !== undefined) {
    newError.stack = redactString(originalError.stack);
  }

  // 处理Error对象上的自定义属性
  const errorRecord = originalError as unknown as Record<string, unknown>;

  for (const key of Object.keys(errorRecord)) {
    if (key !== "message" && key !== "name" && key !== "stack") {
      // 敏感字段直接替换，其他递归脱敏
      newError[key] = isSensitiveKey(key, extraKeys)
        ? REDACTED_TEXT
        : redactInner(errorRecord[key], inProgress, extraKeys);
    }
  }

  return newError;
};

/**
 * 脱敏数组中的每个元素
 */
const redactArrayItems = (
  value: unknown[],
  inProgress: WeakSet<object>,
  extraKeys?: readonly string[]
): unknown[] => {
  const redactedArray: unknown[] = Array.from({ length: value.length });
  for (let i = 0; i < value.length; i += 1) {
    redactedArray[i] = redactInner(value[i], inProgress, extraKeys);
  }
  return redactedArray;
};

/**
 * 脱敏对象的所有属性
 */
const redactRecordEntries = (
  recordValue: Record<string, unknown>,
  inProgress: WeakSet<object>,
  extraKeys?: readonly string[]
): Record<string, unknown> => {
  const redactedRecord: Record<string, unknown> = {};
  for (const key of Object.keys(recordValue)) {
    // 敏感字段直接替换，其他递归脱敏
    redactedRecord[key] = isSensitiveKey(key, extraKeys)
      ? REDACTED_TEXT
      : redactInner(recordValue[key], inProgress, extraKeys);
  }
  return redactedRecord;
};

/**
 * 循环引用保护装饰器
 * 在进入对象前标记，退出时清除
 */
const withReentrancyGuard = <T>(
  obj: object,
  inProgress: WeakSet<object>,
  run: () => T
): T => {
  inProgress.add(obj);
  try {
    return run();
  } finally {
    inProgress.delete(obj);
  }
};

/**
 * 核心脱敏函数 - 递归处理任意类型
 *
 * @param value - 要脱敏的值
 * @param inProgress - 正在处理的对象集合（用于检测循环引用）
 * @param extraKeys - 用户自定义敏感字段
 * @returns 脱敏后的值
 */
const redactInner = <T>(
  value: T,
  inProgress: WeakSet<object>,
  extraKeys?: readonly string[]
): T => {
  // 处理 null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // 处理字符串
  if (typeof value === "string") {
    return redactString(value) as unknown as T;
  }

  // 处理非对象类型（number、boolean等）
  const type = typeof value;
  if (type !== "object") {
    return value;
  }

  // 处理Date对象（返回新实例）
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }

  const obj = value as object;

  // 检测循环引用
  if (inProgress.has(obj)) {
    return CIRCULAR_REF as unknown as T;
  }

  // 处理Error对象
  if (value instanceof Error) {
    return withReentrancyGuard(obj, inProgress, () =>
      redactErrorClone(value, inProgress, extraKeys)
    ) as unknown as T;
  }

  // 处理数组
  if (Array.isArray(value)) {
    return withReentrancyGuard(obj, inProgress, () =>
      redactArrayItems(value, inProgress, extraKeys)
    ) as unknown as T;
  }

  // 处理普通对象
  return withReentrancyGuard(obj, inProgress, () =>
    redactRecordEntries(value as Record<string, unknown>, inProgress, extraKeys)
  ) as unknown as T;
};

// ============================================================
// 10. 公共API - 导出函数
// ============================================================

/**
 * 对任意值进行PII脱敏
 * @internal
 * @param value - 需要脱敏的数据（可以是任何类型）
 * @param extraKeys - 额外的敏感字段名
 * @returns 脱敏后的数据（深拷贝）
 *
 * @example
 * // 基本使用
 * const data = {
 *   email: "user@example.com",
 *   password: "secret123",
 *   nested: { token: "eyJ..." }
 * };
 * const safe = redact(data);
 * // → { email: "[REDACTED]", password: "[REDACTED]", nested: { token: "[REDACTED]" } }
 *
 * // 自定义敏感字段
 * const safe = redact(data, ["internal-id", "device-id"]);
 */
export const redact = <T>(value: T, extraKeys?: readonly string[]): T =>
  redactInner(value, new WeakSet(), extraKeys);

// ============================================================
// 11. HTTP Request 脱敏
// ============================================================

/**
 * 脱敏HTTP Request对象
 * @internal
 * 处理内容：
 * - URL中的用户名/密码/主机名/路径/查询参数
 * - Headers中的敏感字段
 * - HTTP方法
 *
 * 注意：故意不处理Body，避免消费原始请求流
 *
 * @param request - 原始Request对象
 * @param extraKeys - 额外的敏感Header名
 * @returns 脱敏后的Request对象（仅用于日志记录）
 *
 * @example
 * const safeRequest = redactRequest(request);
 * logger.info("Request received", {
 *   url: safeRequest.url,        // 已脱敏
 *   headers: safeRequest.headers // 已脱敏
 * });
 */

export const redactRequest = (
  request: Request,
  extraKeys?: readonly string[]
): Request => {
  // 1. 脱敏URL
  const redactedUrl = redactRequestUrl(request.url);

  // 2. 脱敏Headers
  const nextHeaders = new Headers();
  let headersChanged = false;

  for (const [name, value] of request.headers.entries()) {
    const redacted = isSensitiveKey(name, extraKeys)
      ? REDACTED_TEXT
      : redactString(value);

    if (redacted !== value) {
      headersChanged = true;
    }
    nextHeaders.set(name, redacted);
  }

  // 3. 脱敏HTTP方法
  const redactedMethod = redactString(request.method);
  const urlChanged = redactedUrl !== request.url;
  const methodChanged = redactedMethod !== request.method;

  // 4. 如果没有任何变化，直接返回原request
  if (!(urlChanged || headersChanged || methodChanged)) {
    return request;
  }

  // 5. 构建新的Request对象（不含body）
  const init: RequestInit = {
    headers: nextHeaders,
    method: redactedMethod,
    redirect: request.redirect,
    signal: request.signal,
  };

  return new Request(redactedUrl, init);
};
