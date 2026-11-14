import { Elysia } from 'elysia'

/** Elysia 1.x keeps an instance's lifecycle hooks on an `event` table. */
export const isElysia2 = !('event' in new Elysia())

// A variable specifier keeps the typecheck, which runs against Elysia 1.4,
// from resolving a subpath only 2.x ships.
const websocketSubpath = 'elysia/websocket'
const { websocket } = isElysia2
  ? ((await import(websocketSubpath)) as { websocket: () => Elysia })
  : { websocket: () => new Elysia() }

/** Elysia 2 builds `.ws()` routes only on an app that installed this. */
export const websocketCapability = (): Elysia => websocket()

/**
 * The context a socket handler reads its `log` and `store` from: `ws.data`
 * on 1.x, the socket itself on 2.x.
 */
export const wsContext = <Socket extends { data?: unknown }>(
  ws: Socket
): Socket['data'] => (isElysia2 ? ws : ws.data) as Socket['data']
