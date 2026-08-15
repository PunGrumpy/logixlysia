[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / httpError

# Function: httpError()

> **httpError**(`status`, `detail?`, `extensions?`): `HTTPError`

Defined in: [packages/elogs/src/errors.ts:134](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/errors.ts#L134)

创建一个 HTTPError 实例,匿名类继承避免污染全局命名空间。

## Parameters

### status

`number` \| `"Continue"` \| `"Switching Protocols"` \| `"Processing"` \| `"Early Hints"` \| `"OK"` \| `"Created"` \| `"Accepted"` \| `"Non-Authoritative Information"` \| `"No Content"` \| `"Reset Content"` \| `"Partial Content"` \| `"Multi-Status"` \| `"Already Reported"` \| `"Multiple Choices"` \| `"Moved Permanently"` \| `"Found"` \| `"See Other"` \| `"Not Modified"` \| `"Temporary Redirect"` \| `"Permanent Redirect"` \| `"Bad Request"` \| `"Unauthorized"` \| `"Payment Required"` \| `"Forbidden"` \| `"Not Found"` \| `"Method Not Allowed"` \| `"Not Acceptable"` \| `"Proxy Authentication Required"` \| `"Request Timeout"` \| `"Conflict"` \| `"Gone"` \| `"Length Required"` \| `"Precondition Failed"` \| `"Payload Too Large"` \| `"URI Too Long"` \| `"Unsupported Media Type"` \| `"Range Not Satisfiable"` \| `"Expectation Failed"` \| `"I'm a teapot"` \| `"Enhance Your Calm"` \| `"Misdirected Request"` \| `"Unprocessable Content"` \| `"Locked"` \| `"Failed Dependency"` \| `"Too Early"` \| `"Upgrade Required"` \| `"Precondition Required"` \| `"Too Many Requests"` \| `"Request Header Fields Too Large"` \| `"Unavailable For Legal Reasons"` \| `"Internal Server Error"` \| `"Not Implemented"` \| `"Bad Gateway"` \| `"Service Unavailable"` \| `"Gateway Timeout"` \| `"HTTP Version Not Supported"` \| `"Variant Also Negotiates"` \| `"Insufficient Storage"` \| `"Loop Detected"` \| `"Not Extended"` \| `"Network Authentication Required"`

### detail?

`string`

### extensions?

`Record`\<`string`, `unknown`\>

## Returns

`HTTPError`

## Example

```ts
throw httpError(404, "user not found", { userId: 42 });
// → 响应 404 + application/problem+json + createElogs 写一条 WARNING 日志
```
