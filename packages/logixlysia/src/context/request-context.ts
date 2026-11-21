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

/** A store whose owner can also pin fields. Only the plugin pins. */
export interface PinnableContextStore extends RequestContextStore {
  /**
   * Sets fields that later merges for this key cannot change. For values the
   * library owns, such as the request id.
   */
  pinContext: (key: ContextKey, fields: Record<string, unknown>) => void
}

const MAX_MERGE_DEPTH = 8

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const readOwn = (source: Record<string, unknown>, field: string): unknown =>
  Object.hasOwn(source, field) ? source[field] : undefined

// defineProperty, not assignment: a `__proto__` key must become an own property.
const defineField = (
  target: Record<string, unknown>,
  field: string,
  value: unknown
): void => {
  Object.defineProperty(target, field, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

/**
 * Plain objects on both sides merge into a fresh object, up to {@link MAX_MERGE_DEPTH}
 * levels deep; anything else replaces. Neither input is mutated, so the live bag is never
 * edited in place.
 */
const mergeValue = (
  previous: unknown,
  next: unknown,
  depth: number
): unknown => {
  if (
    depth >= MAX_MERGE_DEPTH ||
    !isPlainObject(previous) ||
    !isPlainObject(next)
  ) {
    return next
  }
  const merged: Record<string, unknown> = {}
  for (const field of Object.keys(previous)) {
    defineField(merged, field, previous[field])
  }
  for (const field of Object.keys(next)) {
    defineField(
      merged,
      field,
      mergeValue(readOwn(previous, field), next[field], depth + 1)
    )
  }
  return merged
}

const EMPTY_CONTEXT: Readonly<Record<string, unknown>> = Object.freeze({})

/**
 * Elysia hands WebSocket hooks a fresh wrapper object per event; only its
 * `raw` socket is the same across a connection's lifetime, so key by that.
 * A `Request` has no `raw`, so HTTP keys are unchanged.
 */
export const keyOf = (key: ContextKey): ContextKey => {
  const raw = 'raw' in key ? key.raw : undefined
  return typeof raw === 'object' && raw !== null ? raw : key
}

export const createRequestContextStore = (): PinnableContextStore => {
  const bags = new WeakMap<ContextKey, Record<string, unknown>>()
  const pinned = new WeakMap<ContextKey, Set<string>>()

  const getOrCreate = (key: ContextKey): Record<string, unknown> => {
    const bagKey = keyOf(key)
    let bag = bags.get(bagKey)
    if (!bag) {
      bag = {}
      bags.set(bagKey, bag)
    }
    return bag
  }

  return {
    clearContext(key) {
      const bagKey = keyOf(key)
      bags.delete(bagKey)
      pinned.delete(bagKey)
    },
    getContext(key) {
      const bag = bags.get(keyOf(key))
      return bag ? { ...bag } : {}
    },
    mergeContext(key, partial) {
      if (Object.keys(partial).length === 0) {
        return
      }
      const bag = getOrCreate(key)
      const pins = pinned.get(keyOf(key))
      for (const field of Object.keys(partial)) {
        if (pins?.has(field)) {
          continue
        }
        defineField(
          bag,
          field,
          mergeValue(readOwn(bag, field), partial[field], 0)
        )
      }
    },
    peekContext(key) {
      return bags.get(keyOf(key)) ?? EMPTY_CONTEXT
    },
    pinContext(key, fields) {
      const bag = getOrCreate(key)
      const bagKey = keyOf(key)
      let pins = pinned.get(bagKey)
      if (!pins) {
        pins = new Set()
        pinned.set(bagKey, pins)
      }
      for (const field of Object.keys(fields)) {
        defineField(bag, field, fields[field])
        pins.add(field)
      }
    }
  }
}

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

  const mergedContext = hasExplicit
    ? mergeValue(
        accumulated,
        isPlainObject(explicit) ? explicit : { ...explicit },
        0
      )
    : { ...accumulated }

  return { ...data, context: mergedContext }
}
