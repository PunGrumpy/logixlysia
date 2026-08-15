import type { CreateElogs } from "@pori15/elogs";

export const statusRouter = <App extends CreateElogs>(app: App) =>
  app.get(
    "/status/:code",
    {
      detail: {
        hide: true,
      },
    },
    ({ params, set }) => {
      const code = Number(params.code);
      set.status = Number.isFinite(code) ? code : 400;
      return { status: set.status };
    }
  );
