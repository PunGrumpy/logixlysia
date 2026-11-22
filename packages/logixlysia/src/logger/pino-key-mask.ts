import { isSensitiveKey, REDACTED_TEXT } from '../utils/redact'

type Entry = [key: string, value: unknown, descriptor: PropertyDescriptor]
type Carried = [key: string | symbol, descriptor: PropertyDescriptor]

interface Plain {
  /** Own properties JSON does not print, copied as they are. */
  carried: Carried[]
  /** Own properties JSON prints: enumerable string keys, or an array's elements. */
  entries: Entry[]
  /** An array's length, `undefined` for an object. */
  length: number | undefined
  nullPrototype: boolean
}

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null

// Everything the walk needs from one object, read once and from property
// descriptors so that no getter runs. `undefined` means the value is not
// plain data: it has another prototype, an accessor property, or a `toJSON`
// that decides what is printed.
const readPlain = (value: object): Plain | undefined => {
  try {
    const isArray = Array.isArray(value)
    const proto: unknown = Object.getPrototypeOf(value)
    const plain = isArray
      ? proto === Array.prototype
      : proto === Object.prototype || proto === null
    if (!plain) {
      return
    }
    const entries: Entry[] = []
    const carried: Carried[] = []
    let length: number | undefined
    // An array lists its elements first, then `length`, then anything else.
    let inElements = isArray
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined) {
        continue
      }
      if (!('value' in descriptor)) {
        return
      }
      if (key === 'toJSON' && typeof descriptor.value === 'function') {
        return
      }
      if (isArray && key === 'length') {
        length = descriptor.value as number
        inElements = false
        continue
      }
      const printed =
        typeof key === 'string' &&
        (isArray ? inElements : descriptor.enumerable === true)
      if (printed) {
        entries.push([key, descriptor.value, descriptor])
      } else {
        carried.push([key, descriptor])
      }
    }
    return { carried, entries, length, nullPrototype: proto === null }
  } catch {
    // A Proxy can refuse to be inspected.
  }
}

const emptyLike = (plain: Plain): object => {
  if (plain.length !== undefined) {
    const copy: unknown[] = []
    copy.length = plain.length
    return copy
  }
  return plain.nullPrototype ? Object.create(null) : {}
}

interface MaskWalk {
  extraKeys: readonly string[] | undefined
  inner: object | undefined
  isSerialized: (key: string) => boolean
  logged: object
}

const nodeOf = (walk: MaskWalk, value: object): object =>
  value === walk.logged && walk.inner !== undefined ? walk.inner : value

const isSkipped = (walk: MaskWalk, owner: object, key: string): boolean =>
  owner === walk.logged && walk.isSerialized(key)

const isSensitive = (walk: MaskWalk, node: Plain, key: string): boolean =>
  node.length === undefined && isSensitiveKey(key, walk.extraKeys)

// Each object is read once, so a cycle or a value shared by many parents
// costs no more than the number of objects. `undefined` when nothing under
// the logged object holds a printed sensitive key.
const collectPlain = (
  walk: MaskWalk,
  root: Plain
): Map<object, Plain> | undefined => {
  const plain = new Map<object, Plain>([[walk.logged, root]])
  const opaque = new Set<object>()
  const pending: object[] = [walk.logged]
  let found = false
  for (let owner = pending.pop(); owner !== undefined; owner = pending.pop()) {
    const node = plain.get(owner) as Plain
    for (const [key, value] of node.entries) {
      if (isSkipped(walk, owner, key)) {
        continue
      }
      if (isSensitive(walk, node, key)) {
        found ||= value !== undefined
        continue
      }
      if (!isObject(value)) {
        continue
      }
      const target = nodeOf(walk, value)
      if (plain.has(target) || opaque.has(target)) {
        continue
      }
      const read = target === walk.inner ? root : readPlain(value)
      if (read === undefined) {
        opaque.add(target)
        continue
      }
      plain.set(target, read)
      pending.push(target)
    }
  }
  return found ? plain : undefined
}

const maskedCopies = (walk: MaskWalk, plain: Map<object, Plain>): unknown => {
  const copies = new Map<object, object>()
  for (const [source, node] of plain) {
    copies.set(source, emptyLike(node))
  }
  for (const [source, node] of plain) {
    const copy = copies.get(source) as object
    for (const [key, value, descriptor] of node.entries) {
      let printed = value
      if (isSkipped(walk, source, key)) {
        printed = value
      } else if (isSensitive(walk, node, key)) {
        printed = value === undefined ? value : REDACTED_TEXT
      } else if (isObject(value)) {
        printed = copies.get(nodeOf(walk, value)) ?? value
      }
      Object.defineProperty(copy, key, { ...descriptor, value: printed })
    }
    for (const [key, descriptor] of node.carried) {
      Object.defineProperty(copy, key, descriptor)
    }
  }
  return copies.get(walk.logged)
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
  const root = readPlain(logged)
  if (root === undefined) {
    return logged
  }

  // Seen from inside itself the logged object is not at the top level, where
  // no serializer runs, so it then gets a second copy with nothing skipped.
  const walk: MaskWalk = {
    extraKeys,
    inner: root.entries.some(([key]) => isSerialized(key)) ? {} : undefined,
    isSerialized,
    logged
  }
  const plain = collectPlain(walk, root)
  return plain === undefined ? logged : maskedCopies(walk, plain)
}
