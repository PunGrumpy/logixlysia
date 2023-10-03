
# Logysia
A logging middleware for the [Elysia](https://elysiajs.com) web framework. Developed with [Bun](https://bun.sh).


## Installation

```sh
bun add @grotto/logysia
```
## Usage/Examples

```typescript
import {logger} from '@grotto/logysia';
import { Elysia } from "elysia";


if (import.meta.main) {
    const app = new Elysia()
        .use(logger())
        .get("/", ctx => "Hello, world!");
}
```

## Result
```sh
POST / Error 404 NOT_FOUND | 17
PUT / Error 404 NOT_FOUND | 17
PATCH / Error 404 NOT_FOUND | 17
DELETE / Error 404 NOT_FOUND | 17
OPTIONS / Error 404 NOT_FOUND | 17
HEAD / Error 404 NOT_FOUND | 17
```
![Alt text](https://i.ibb.co/TH0WpXv/image.png)