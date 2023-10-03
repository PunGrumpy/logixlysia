
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
![Alt text](https://i.ibb.co/5YknHt6/image.png)

Logysia also supports printing when there are errors in your application.