import { type CreateElogs, pino } from "@pori15/elogs";

export const pinoRouter = <App extends CreateElogs>(app: App) =>
  app.get("/pino", {}, () => {
    pino.info({ at: Date.now(), feature: "pino" }, "pino log example");
    return { ok: true };
  });
