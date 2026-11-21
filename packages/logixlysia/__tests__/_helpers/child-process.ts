/**
 * Budget for a test that waits on a `bun` or `node` child process. The
 * default of 5 s is too short when the machine is busy: the process start
 * alone has been seen to take 9 s.
 */
export const CHILD_PROCESS_TIMEOUT_MS = 30_000
