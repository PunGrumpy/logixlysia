import node from "@elysiajs/node";
import { swagger } from "@elysiajs/swagger";
import { Elysia, env } from "elysia";
import packageJson from "logixlysia/package.json";

import { routers } from "./routers";

export const app = new Elysia({
  adapter: node(),
  name: "Elysia Node with Logixlysia",
})
  .use(
    swagger({
      documentation: {
        info: {
          title: "Elysia Node with Logixlysia",
          version: packageJson.version,
        },
      },
      scalarConfig: {
        theme: "saturn",
      },
    })
  )
  .use(routers);

app.listen({
  port: env.PORT,
});
