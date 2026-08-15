/** @internal */
export const parseError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    return error.message as string;
  }
  return String(error);
};

/** @internal */
export interface StructuredError {
  fix?: string;
  internal?: unknown;
  link?: string;
  why?: string;
}

/** @internal */
export const isStructuredError = (
  value: unknown
): value is StructuredError & Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  ("why" in value || "fix" in value || "link" in value || "internal" in value);

/** @internal */
export interface NormalizedLoggedError {
  /** Safe structured representation for data/transport meta. */
  error: Record<string, unknown>;
  /** Safe one-line message for the log line. */
  message: string;
}

const isValidationErrorLike = (
  value: unknown
): value is Error & { all?: unknown[]; status?: number; type?: string } =>
  value instanceof Error &&
  // `code` is Elysia's minification-safe discriminant — `.name` and
  // `.constructor.name` both degrade to a mangled string under bundler
  // minification (e.g. `bun build --minify`, esbuild), so `code` must be
  // checked too or validation bodies silently re-leak in that build mode.
  ((value as { code?: unknown }).code === "VALIDATION" ||
    value.name === "ValidationError" ||
    value.constructor?.name === "ValidationError");

const STRUCTURED_ERROR_KEYS = [
  "fix",
  "internal",
  "link",
  "message",
  "name",
  "status",
  "why",
] as const;

const copyStructuredErrorFields = (
  record: Record<string, unknown>
): Record<string, unknown> => {
  const safe: Record<string, unknown> = {};
  for (const key of STRUCTURED_ERROR_KEYS) {
    if (record[key] !== undefined) {
      safe[key] = record[key];
    }
  }
  return safe;
};

/** @internal */
export const normalizeLoggedError = (
  error: unknown,
  logErrorPayload: boolean
): NormalizedLoggedError => {
  if (isValidationErrorLike(error) && !logErrorPayload) {
    const failures = Array.isArray(error.all) ? error.all : [];
    const paths = failures
      .map((failure) =>
        typeof failure === "object" && failure !== null && "path" in failure
          ? String((failure as { path: unknown }).path)
          : ""
      )
      .filter(Boolean);
    const scope = typeof error.type === "string" ? error.type : "request";
    const message =
      paths.length > 0
        ? `Validation failed (${scope}): ${paths.join(", ")}`
        : `Validation failed (${scope})`;
    return {
      error: { failedPaths: paths, name: "ValidationError", type: scope },
      message,
    };
  }

  if (error instanceof Error) {
    const safe = copyStructuredErrorFields(
      error as unknown as Record<string, unknown>
    );
    safe.message = error.message;
    // Native Error subclasses don't set `.name` unless the author overrides
    // it, so it reads back as the generic "Error". Prefer the constructor
    // name in that case.
    safe.name =
      error.name === "Error"
        ? (error.constructor?.name ?? error.name)
        : error.name;
    return { error: safe, message: parseError(error) };
  }

  if (isStructuredError(error)) {
    return {
      error: copyStructuredErrorFields(error as Record<string, unknown>),
      message: parseError(error),
    };
  }

  return { error: { value: String(error) }, message: parseError(error) };
};
