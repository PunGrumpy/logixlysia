/**
 * Whether stdout should get colors: an interactive terminal, and no `NO_COLOR`
 * in the environment (https://no-color.org: set and not empty turns color off).
 */
export const stdoutWantsColor = (): boolean =>
  typeof process !== 'undefined' &&
  process.stdout?.isTTY === true &&
  !process.env.NO_COLOR
