import { isSensitiveKey, REDACTED_TEXT } from '../utils/redact'

type Key = number | string
type Entry = [key: Key, value: unknown]

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null

// JSON leaves such a value out of a line, so masking it would add a field.
const isUnprinted = (value: unknown): boolean =>
  value === undefined ||
  typeof value === 'function' ||
  typeof value === 'symbol'

// The own data of a plain object or array, read from property descriptors so
// that no getter runs. `undefined` means the value is not plain data: it has
// another prototype, a getter, or a `toJSON` that decides what is printed.
const plainEntries = (value: object): Entry[] | undefined => {
  try {
    const isArray = Array.isArray(value)
    const proto: unknown = Object.getPrototypeOf(value)
    const plain = isArray
      ? proto === Array.prototype
      : proto === Object.prototype || proto === null
    if (!plain) {
      return
    }
    const toJson = Object.getOwnPropertyDescriptor(value, 'toJSON')
    if (
      toJson !== undefined &&
      (!('value' in toJson) || typeof toJson.value === 'function')
    ) {
      return
    }
    const keys: Key[] = isArray
      ? Array.from({ length: (value as unknown[]).length }, (_, index) => index)
      : Object.keys(value)
    const entries: Entry[] = []
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined) {
        continue
      }
      if (!('value' in descriptor)) {
        return
      }
      entries.push([key, descriptor.value])
    }
    return entries
  } catch {
    // A Proxy can refuse to be inspected.
  }
}

const emptyLike = (source: object): object => {
  if (Array.isArray(source)) {
    return Array.from({ length: (source as unknown[]).length })
  }
  return Object.getPrototypeOf(source) === null ? Object.create(null) : {}
}

const setOwn = (copy: object, key: Key, value: unknown): void => {
  if (key === '__proto__') {
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    })
    return
  }
  ;(copy as Record<Key, unknown>)[key] = value
}

type SkipKey = (owner: object, key: Key) => boolean
type Sensitive = (key: Key) => boolean

// The plain containers under `logged`, or `undefined` when none of them holds
// a printed sensitive key. Each container is visited once, so a cycle or a
// value shared by many parents costs no more than the number of containers.
const findPlainWithSensitive = (
  logged: object,
  rootEntries: Entry[],
  skipped: SkipKey,
  sensitive: Sensitive
): Map<object, Entry[]> | undefined => {
  const plain = new Map<object, Entry[]>([[logged, rootEntries]])
  const pending: object[] = [logged]
  let found = false
  for (let owner = pending.pop(); owner !== undefined; owner = pending.pop()) {
    for (const [key, value] of plain.get(owner) ?? []) {
      if (skipped(owner, key)) {
        continue
      }
      if (sensitive(key)) {
        found ||= !isUnprinted(value)
        continue
      }
      if (isObject(value) && !plain.has(value)) {
        const entries = plainEntries(value)
        if (entries !== undefined) {
          plain.set(value, entries)
          pending.push(value)
        }
      }
    }
  }
  return found ? plain : undefined
}

const maskedCopies = (
  logged: object,
  plain: Map<object, Entry[]>,
  skipped: SkipKey,
  sensitive: Sensitive
): unknown => {
  const copies = new Map<object, object>()
  for (const source of plain.keys()) {
    copies.set(source, emptyLike(source))
  }
  for (const [source, entries] of plain) {
    const copy = copies.get(source) as object
    for (const [key, value] of entries) {
      if (skipped(source, key)) {
        setOwn(copy, key, value)
      } else if (sensitive(key)) {
        setOwn(copy, key, isUnprinted(value) ? value : REDACTED_TEXT)
      } else {
        setOwn(
          copy,
          key,
          isObject(value) ? (copies.get(value) ?? value) : value
        )
      }
    }
  }
  return copies.get(logged)
}

/**
 * The object a `store.pino` call was given, with every sensitive key in its
 * plain data masked. The same object is returned when there is nothing to
 * mask or when it is not plain data. `isSerialized` names the top-level keys
 * pino hands to a serializer, which is owed the value as it was logged.
 */
export const maskPinoKeys = (
  logged: unknown,
  extraKeys: readonly string[] | undefined,
  isSerialized: (key: string) => boolean
): unknown => {
  if (!isObject(logged) || Array.isArray(logged)) {
    return logged
  }
  const rootEntries = plainEntries(logged)
  if (rootEntries === undefined) {
    return logged
  }

  const skipped: SkipKey = (owner, key) =>
    owner === logged && typeof key === 'string' && isSerialized(key)
  const sensitive: Sensitive = key =>
    typeof key === 'string' && isSensitiveKey(key, extraKeys)

  const plain = findPlainWithSensitive(logged, rootEntries, skipped, sensitive)
  return plain === undefined
    ? logged
    : maskedCopies(logged, plain, skipped, sensitive)
}
