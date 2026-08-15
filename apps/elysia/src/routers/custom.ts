import { CreateElogs } from "@pori15/elogs";

export const customRouter = <App extends CreateElogs>(app: App) =>
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
