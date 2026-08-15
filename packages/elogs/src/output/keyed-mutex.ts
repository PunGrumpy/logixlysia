/** @internal */
export interface KeyedMutex {
  /**
   * Serializes work for `key`: resolves once any prior holder for the same
   * key has released, and returns a release function the caller MUST call
   * exactly once to hand the lock to the next waiter (if any).
   */
  acquire: (key: string) => Promise<() => void>;
}

/**
 * Creates an independent keyed mutex: acquisitions for different keys never
 * block each other, while acquisitions for the same key are serialized in
 * FIFO order.
 * @internal
 */
export const createKeyedMutex = (): KeyedMutex => {
  const locks = new Map<string, Promise<void>>();

  const acquire = async (key: string): Promise<() => void> => {
    const prior = locks.get(key) ?? Promise.resolve();

    let release: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Register before awaiting: same-tick callers must chain onto THIS lock,
    // not the one that was current when they called acquire().
    locks.set(key, current);

    await prior;

    return () => {
      release?.();
      if (locks.get(key) === current) {
        locks.delete(key);
      }
    };
  };

  return { acquire };
};
