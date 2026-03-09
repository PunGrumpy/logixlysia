import type { Logixlysia } from "logixlysia";

export const pinoRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    "/pino",
    ({ store }) => {
      store.pino.info({ at: Date.now(), feature: "pino" }, "pino log example");
      return { ok: true };
    },
    {
      detail: {
        summary: "Pino log example",
        tags: ["logging"],
      },
    }
  );
