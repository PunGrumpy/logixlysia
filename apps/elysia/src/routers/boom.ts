import { Elogs } from "@pori15/elogs";

export const boomRouter = <App extends Elogs>(app: App) =>
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
