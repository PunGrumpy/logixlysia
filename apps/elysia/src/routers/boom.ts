import type { Logixlysia } from "logixlysia";

export const boomRouter = <App extends Logixlysia>(app: App) =>
  app.get("/boom", {
    detail: {
      summary: "Boom example",
      tags: ["error"],
    },
  }, () => {
    throw new Error("Boom!");
  });
