import { describe, expect, test } from "bun:test";
import { spawnSync } from "bun";

// The "not installed" branch needs @opentelemetry/api to be unresolvable, but
// mock.module registrations from otel-mock.test.ts persist for the whole test
// process and are evaluated eagerly, so they can neither be unregistered nor
// made to throw. Run the assertion in a fresh subprocess with no mocks.
const script = `
import { createLogger } from './src/logger'
import { injectTraceContext } from './src/otel'

const logger = createLogger({
  config: { disableInternalLogger: true, disableFileLogging: true }
})
const request = new Request('http://localhost/')

const result = await injectTraceContext(logger, request)
if (result !== undefined) {
  throw new Error('expected injectTraceContext to return undefined')
}
if (Object.keys(logger.getContext(request)).length > 0) {
  throw new Error('expected request context to stay empty')
}
`;

describe("createElogs/otel", () => {
  test("injectTraceContext is a no-op when OpenTelemetry is not installed", () => {
    const result = spawnSync({
      cmd: ["bun", "-e", script],
      cwd: `${import.meta.dir}/../..`,
      stderr: "pipe",
    });

    if (result.exitCode !== 0) {
      throw new Error(`Subprocess failed:\n${result.stderr.toString()}`);
    }
    expect(result.exitCode).toBe(0);
  });
});
