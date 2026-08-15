import { Elysia, env } from "elysia";
import { routers } from "./routers";

// TODO(elysia-2): re-add the OpenAPI/Scalar plugin once an Elysia 2 compatible
// release is published. Route `detail` metadata below is kept intact for it.
export const app = new Elysia({
  name: "Elysia with Elogs",
}).use(routers);

app.listen({
  port: env.PORT,
});
