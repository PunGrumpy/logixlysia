import { Logixlysia } from "@pori15/logixlysia";

export const boomRouter = <App extends Logixlysia>(app: App) =>
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
