/**
 * The server information.
 *
 * @interface Server
 *
 * @property {string} hostname The server hostname.
 * @property {number} port The server port.
 * @property {string} protocol The server protocol.
 */
interface Server {
  hostname?: string
  port?: number
  protocol?: string
}

export { Server }
