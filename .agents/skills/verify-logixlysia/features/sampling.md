# Sampling

Head sampling keeps a percentage of records per level. Tail sampling holds the head-dropped records of a request and replays them when the finished request matches a rule: a duration, a status or a path. A replayed record keeps the duration it had when it was captured, not the duration at replay.

## Sub-features

- `head-drop` drops an unrescued request's sampled lines, access line included.
- `tail-duration` replays a request that took at least `tail.durationMs`.
- `tail-status` replays a request whose status is at or above `tail.status`.
- `replay-duration` gives each replayed record its capture-time `durationMs`, and the access line the full request time.

## How to get to it (user POV)

- Pass `config.sampling.head` and `config.sampling.tail` to `logixlysia()`.

## Driving it with control-logixlysia

Preconditions:

- `work/sampling.ts` holds this app.

```ts
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

export default new Elysia()
  .use(
    logixlysia({
      config: {
        consoleFormat: 'json',
        sampling: { head: { INFO: 0 }, tail: { durationMs: 200, status: 500 } }
      }
    })
  )
  .get('/slow', async ({ log }) => {
    log.info('captured before the wait')
    await Bun.sleep(300)
    log.info('captured after the wait')
    return 'slow'
  })
  .get('/fast', ({ log }) => {
    log.info('dropped, never replayed')
    return 'fast'
  })
  .get('/fail', ({ log, set }) => {
    log.info('captured before the failure')
    set.status = 500
    return 'failed'
  })
```

- **Serve three requests.** Run `$C run --run "$RUN" --app sampling.ts --label sampling --req 'GET /slow' --req 'GET /fast' --req 'GET /fail'`. Exit code `0`. `/slow` takes about 300 ms.
- **Duration rescue.** Run `grep '^{' <evidence>/<NN>-sampling.stdout.log | jq -c '{message, status, durationMs}'`. `/slow` has three lines in order: `captured before the wait` with `durationMs` below 5, `captured after the wait` with `durationMs` near 300, and the access line with `status` 200 and `durationMs` at least 300.
- **Head drop.** No line mentions `/fast` or `dropped, never replayed`.
- **Status rescue.** stdout has `captured before the failure`, and stderr has the `/fail` access line with `level` `ERROR` and `status` 500.

## Gotchas

- `tail` alone does nothing. Without a `head` rate below 100 nothing is buffered.
- Replayed lines are written when the request finishes, so their `timestamp` is the finish time. Assert `durationMs`, not the timestamp.
- The text line rounds durations. Use `consoleFormat: 'json'` for this recipe.
- Records are only ever buffered with their capture time. The plugin has no path that buffers a record carrying its own `durationOverride`, so a change to that branch alone shows no difference here.
