import { CreateElogsOptions } from "../interfaces";
import { renderBanner } from "./banner";

/**
 * Prints Elysia startup banner (or simple URL line) to stdout.
 *
 * @internal
 */
export const startServer = (
  server: { port?: number; hostname?: string; protocol?: string | null },
  options: CreateElogsOptions
): void => {
  const showStartupMessage = options.startup?.show ?? true;
  if (!showStartupMessage) {
    return;
  }

  const { port, hostname, protocol } = server;
  if (port === undefined || !hostname || !protocol) {
    return;
  }

  const url = `${protocol}://${hostname}:${port}`;
  const message = `🦊 Elysia is running at ${url}`;

  const format = options.startup?.format ?? "banner";
  if (format === "simple") {
    console.log(message);
    return;
  }

  console.log(renderBanner(message));
};
