const NANOS_PER_MILLI = 1_000_000

/**
 * Milliseconds elapsed since `beforeTime`, or `0` when no start was recorded
 * (`BigInt(0)` is the plugin's "never started" sentinel).
 */
export const elapsedMs = (beforeTime: bigint): number =>
  beforeTime === BigInt(0)
    ? 0
    : Number(process.hrtime.bigint() - beforeTime) / NANOS_PER_MILLI
