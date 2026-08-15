import type { CreateElogs } from "@pori15/elogs";

export const pinoRouter = <App extends CreateElogs>(app: App) =>
  app.get(
    "/pino",
    {
      detail: {
        summary: "Pino log example",
        tags: ["logging"],
      },
    },
    ({ store }) => {
      store.pino.info({ at: Date.now(), feature: "pino" }, "pino log example");
      return { ok: true };
    }
  );
