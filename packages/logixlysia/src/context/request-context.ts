/** HTTP `Request` or WebSocket instance for accumulated context. */
export type ContextKey = Request | object

export interface RequestContextStore {
  clearContext: (key: ContextKey) => void
  getContext: (key: ContextKey) => Readonly<Record<string, unknown>>
  mergeContext: (key: ContextKey, partial: Record<string, unknown>) => void
  /**
   * Non-cloning read of the live context bag. Returns the SAME object stored internally (or a
   * shared frozen empty object) — never hand this to user-facing code, which may retain or
   * mutate it. Only internal, read-only call sites (that immediately spread the result into a
   * new object) may use this; everything else must use {@link RequestContextStore.getContext}.
   */
  peekContext: (key: ContextKey) => Readonly<Record<string, unknown>>
}

const EMPTY_CONTEXT: Readonly<Record<string, unknown>> = Object.freeze({})

export const createRequestContextStore = (): RequestContextStore => {
  const bags = new WeakMap<ContextKey, Record<string, unknown>>()

  const getOrCreate = (key: ContextKey): Record<string, unknown> => {
    let bag = bags.get(key)
    if (!bag) {
      bag = {}
      bags.set(key, bag)
    }
    return bag
  }

  return {
    clearContext(key) {
      bags.delete(key)
    },
    getContext(key) {
      const bag = bags.get(key)
      return bag ? { ...bag } : {}
    },
    mergeContext(key, partial) {
      if (Object.keys(partial).length === 0) {
        return
      }
      const bag = getOrCreate(key)
      Object.assign(bag, partial)
    },
    peekContext(key) {
      return bags.get(key) ?? EMPTY_CONTEXT
    }
  }
}

/** Accumulated request context first; explicit `data.context` wins on key collision. */
export const mergeLogDataContext = (
  data: Record<string, unknown>,
  accumulated: Readonly<Record<string, unknown>>
): Record<string, unknown> => {
  const explicit = data.context
  const hasAccumulated = Object.keys(accumulated).length > 0
  const hasExplicit =
    explicit !== undefined &&
    explicit !== null &&
    typeof explicit === 'object' &&
    !Array.isArray(explicit) &&
    Object.keys(explicit as object).length > 0

  if (!(hasAccumulated || hasExplicit)) {
    return data
  }

  const mergedContext = {
    ...accumulated,
    ...(hasExplicit ? (explicit as Record<string, unknown>) : {})
  }

  return { ...data, context: mergedContext }
}
