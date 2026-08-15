import { CreateElogs } from "@pori15/elogs";

export const boomRouter = <App extends CreateElogs>(app: App) =>
  app.get(
    "/boom",
    {
      detail: {
        summary: "Boom example",
        tags: ["error"],
      },
    },
    () => {
      throw new Error("Boom!");
    }
  );
