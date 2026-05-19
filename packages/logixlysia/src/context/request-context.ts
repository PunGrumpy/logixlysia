export type ContextKey = Request

export interface RequestContextStore {
  clearContext: (key: ContextKey) => void
  getContext: (key: ContextKey) => Readonly<Record<string, unknown>>
  mergeContext: (key: ContextKey, partial: Record<string, unknown>) => void
}

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
    mergeContext(key, partial) {
      if (Object.keys(partial).length === 0) {
        return
      }
      const bag = getOrCreate(key)
      Object.assign(bag, partial)
    },
    getContext(key) {
      const bag = bags.get(key)
      return bag ? { ...bag } : {}
    },
    clearContext(key) {
      bags.delete(key)
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
