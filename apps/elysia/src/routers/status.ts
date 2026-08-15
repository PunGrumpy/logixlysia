import type { Logixlysia } from "@pori15/createLogPlugin";

export const statusRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    "/status/:code",
    {
      detail: {
        summary: "Status example",
        tags: ["status"],
      },
    },
    ({ params, set }) => {
      const code = Number(params.code);
      set.status = Number.isFinite(code) ? code : 400;
      return { status: set.status };
    }
  );
