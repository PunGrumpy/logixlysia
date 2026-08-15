[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / WsHandlerHooks

# Interface: WsHandlerHooks\<TMessage, TWs\>

Defined in: [packages/elogs/src/websocket/wrap-ws.ts:11](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/websocket/wrap-ws.ts#L11)

## Type Parameters

### TMessage

`TMessage` = `unknown`

### TWs

`TWs` *extends* [`WebSocketLike`](WebSocketLike.md) = [`WebSocketLike`](WebSocketLike.md)

## Properties

### close?

> `optional` **close?**: (`ws`) => `void`

Defined in: [packages/elogs/src/websocket/wrap-ws.ts:15](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/websocket/wrap-ws.ts#L15)

#### Parameters

##### ws

`TWs`

#### Returns

`void`

***

### message?

> `optional` **message?**: (`ws`, `message`) => `void`

Defined in: [packages/elogs/src/websocket/wrap-ws.ts:16](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/websocket/wrap-ws.ts#L16)

#### Parameters

##### ws

`TWs`

##### message

`TMessage`

#### Returns

`void`

***

### open?

> `optional` **open?**: (`ws`) => `void`

Defined in: [packages/elogs/src/websocket/wrap-ws.ts:17](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/websocket/wrap-ws.ts#L17)

#### Parameters

##### ws

`TWs`

#### Returns

`void`
