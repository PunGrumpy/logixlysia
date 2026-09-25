# video

The logixlysia promo clip, built with [Remotion](https://remotion.dev). 1920×1080, 30 fps, 31 s, no audio.

```bash
bun install                          # from the repo root
bun run --filter video dev           # Remotion Studio at http://localhost:3000
bun run --filter video preview       # quick half-resolution render to out/
bun run --filter video render        # final render to out/logixlysia-promo.mp4
```

## Structure

| Time | Scene | File |
| --- | --- | --- |
| 0–7 s | Kinetic words on a paper grid; log-line chips scatter in | `src/scenes/act1-scatter.tsx` |
| 7–12 s | Block wipe into a halftone field; the noisy terminal | `src/scenes/act2-noise.tsx` |
| 12–23.5 s | The field collapses into an orb ("Until now."), the fox, then one access line with its context tree | `src/scenes/act3-reveal.tsx` |
| 23.5–31 s | Tagline, three feature cards, wordmark and install line | `src/scenes/act4-outro.tsx` |

Scene boundaries live in `src/promo.tsx`. Each wipe finishes exactly on its boundary and the next act opens on the same full-bleed field, so cuts are invisible. Shared primitives (paper grid, halftone, block wipe, glass, grain, eased pop and typewriter helpers) are in `src/lib/ui.tsx`.

Fonts are bundled in `public/fonts` so renders are deterministic. The access line in Act 3 mirrors the real console output: `error.code`, `error.why` and `error.fix` are the fields `HttpError` carries.
