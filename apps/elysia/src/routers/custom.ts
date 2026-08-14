import { Logixlysia } from "@pori15/logixlysia";

export const customRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    "/custom",
    {
      detail: {
        summary: "Custom logger example",
        tags: ["logging"],
      },
    },
    ({ request, store }) => {
      store.logger.info(request, "Hello from custom logger", {
        feature: "custom-route-log",
        userId: 123,
      });
      return { ok: true };
    }
  );
