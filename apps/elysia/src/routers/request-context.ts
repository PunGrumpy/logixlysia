import type { CreateElogs } from "@pori15/elogs";
import { useLogger } from "@pori15/elogs";

const dbQueryHelper = async () => {
  const log = useLogger();
  log.mergeContext({ query: "SELECT * FROM users" });
  await Promise.resolve();
  log.info("Running database query in nested service");
};

export const requestContextRouter = <App extends CreateElogs>(app: App) =>
  app
    .get("/checkout", {}, ({ request, store }) => {
      store.logger.mergeContext(request, { userId: "usr_demo" });
      store.logger.mergeContext(request, {
        cart: { items: 2, total: 4999 },
      });
      return {
        note: "See access log — context merged automatically",
        ok: true,
      };
    })
    .get("/async-context", {}, async ({ log }) => {
      log.mergeContext({ userId: "usr_async" });
      log.info("Starting async request processing");

      await dbQueryHelper();

      return {
        note: "Check console logs for useLogger() context propagation",
        ok: true,
      };
    });
