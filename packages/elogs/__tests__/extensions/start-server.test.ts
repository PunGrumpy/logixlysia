import { describe, expect, test } from "bun:test";
import { startServer } from "../../src/extensions";
import type { CreateElogsOptions } from "../../src/interfaces";
import { spyConsole } from "../_helpers/console";

describe("startServer", () => {
  test("renders banner by default", () => {
    const { spies, restore } = spyConsole(["log"]);

    const options: CreateElogsOptions = {};
    startServer(
      { hostname: "localhost", port: 3000, protocol: "http" },
      options
    );

    expect(spies.log).toHaveBeenCalledTimes(1);
    const output = spies.log.mock.calls[0]?.[0];
    expect(String(output)).toContain("┌");
    expect(String(output)).toContain("🦊 Elysia is running at");

    restore();
  });

  test("renders simple message when configured", () => {
    const { spies, restore } = spyConsole(["log"]);

    const options: CreateElogsOptions = { startup: { format: "simple" } };
    startServer(
      { hostname: "localhost", port: 3000, protocol: "http" },
      options
    );

    expect(spies.log).toHaveBeenCalledTimes(1);
    const output = spies.log.mock.calls[0]?.[0];
    expect(String(output)).toContain(
      "🦊 Elysia is running at http://localhost:3000"
    );
    expect(String(output)).not.toContain("┌");

    restore();
  });

  test("does nothing when startup.show is false", () => {
    const { spies, restore } = spyConsole(["log"]);

    const options: CreateElogsOptions = { startup: { show: false } };
    startServer(
      { hostname: "localhost", port: 3000, protocol: "http" },
      options
    );

    expect(spies.log).not.toHaveBeenCalled();

    restore();
  });

  test("does nothing when server info is incomplete", () => {
    const { spies, restore } = spyConsole(["log"]);

    const options: CreateElogsOptions = {};
    startServer({ hostname: "localhost", port: 3000, protocol: null }, options);

    expect(spies.log).not.toHaveBeenCalled();

    restore();
  });
});
