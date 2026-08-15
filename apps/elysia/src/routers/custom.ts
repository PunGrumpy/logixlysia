import { CreateElogs, globalLogger } from "@pori15/elogs";

export const customRouter = <App extends CreateElogs>(app: App) =>
  app.get("/custom", {}, () => {
    globalLogger.info("Hello from custom logger", {
      feature: "custom-route-log",
      userId: 123,
    });
    return { ok: true };
  });
