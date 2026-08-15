import { createPinoLogger as createBogeychan } from "@bogeychan/elysia-logger";
import {
  createElogs,
  globalLogger,
  initGlobalLogger,
  requestStorage,
} from "@pori15/elogs";
import { consola } from "consola";
import { Elysia } from "elysia";
import { createLogger as createEvlog } from "evlog";
import pino from "pino";
import { bench, describe } from "vitest";
import winston from "winston";

const mockRequest = new Request("http://localhost:3000/");

describe("Logger Creation", () => {
  bench("createElogs", () => {
    createElogs();
  });

  bench("pino", () => {
    pino();
  });

  bench("consola", () => {
    consola.create({});
  });

  bench("winston", () => {
    winston.createLogger({});
  });

  bench("evlog", () => {
    createEvlog();
  });

  bench("bogeychan", () => {
    createBogeychan();
  });
});

// Initialize loggers with output disabled for fair comparison of overhead
// createElogs is a plugin (returns an Elysia instance), so for per-call
// logging we reach the underlying Logger via the global handle. The plugin
// is the more realistic path — see "Elysia plugin request path" below — but
// `globalLogger.info(...)` exercises the same emit code as `ctx.log.info(...)`
// and is the apples-to-apples comparison with the raw loggers here.
initGlobalLogger({
  config: {
    disableInternalLogger: true,
    pino: { enabled: false },
  },
});
const p = pino({ enabled: false });
const c = consola.create({ level: -1 });
const w = winston.createLogger({
  silent: true,
  transports: [new winston.transports.Console()],
});
const ev = createEvlog();
const bc = createBogeychan({ enabled: false });

describe("Simple Log (String)", () => {
  bench("createElogs", () => {
    requestStorage.run(mockRequest, () => {
      globalLogger.info("Hello World");
    });
  });

  bench("pino", () => {
    p.info("Hello World");
  });

  bench("consola", () => {
    c.info("Hello World");
  });

  bench("winston", () => {
    w.info("Hello World");
  });

  bench("evlog", () => {
    ev.info("Hello World");
  });

  bench("bogeychan", () => {
    bc.info("Hello World");
  });
});

describe("Structured Log (Object)", () => {
  const data = {
    active: true,
    id: 123,
    meta: { foo: "bar" },
    tags: ["a", "b", "c"],
    user: "John Doe",
  };

  bench("createElogs", () => {
    requestStorage.run(mockRequest, () => {
      globalLogger.info("Hello World", data);
    });
  });

  bench("pino", () => {
    p.info(data, "Hello World");
  });

  bench("consola", () => {
    c.info("Hello World", data);
  });

  bench("winston", () => {
    w.info("Hello World", data);
  });

  bench("evlog", () => {
    ev.info("Hello World", data);
  });

  bench("bogeychan", () => {
    bc.info(data, "Hello World");
  });
});

describe("Deep Nested Log", () => {
  const deepData = {
    a: {
      b: {
        c: {
          d: {
            e: "f",
          },
        },
      },
    },
  };

  bench("createElogs", () => {
    requestStorage.run(mockRequest, () => {
      globalLogger.info("Deep nested", deepData);
    });
  });

  bench("pino", () => {
    p.info(deepData, "Deep nested");
  });

  bench("consola", () => {
    c.info("Deep nested", deepData);
  });

  bench("winston", () => {
    w.info("Deep nested", deepData);
  });

  bench("evlog", () => {
    ev.info("Deep nested", deepData);
  });

  bench("bogeychan", () => {
    bc.info(deepData, "Deep nested");
  });
});

const silentLogixConfig = {
  disableFileLogging: true,
  disableInternalLogger: true,
  pino: { enabled: false },
} as const;

const elogsApp = new Elysia()
  .use(createElogs({ config: silentLogixConfig }))
  .get("/", () => "ok");

// `evlog/elysia` and `@bogeychan/elysia-logger` still declare an Elysia 1 peer and
// use the pre-2.0 lifecycle names, so their plugin-path benchmarks are parked until
// they ship Elysia 2 builds. Their raw-logger benchmarks above are unaffected.
describe("Elysia plugin request path", () => {
  bench("createElogs", async () => {
    await elogsApp.handle(new Request("http://localhost/"));
  });
});
