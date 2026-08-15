# 🦊 Elogs's documentation website

Built with [Blume](https://github.com/haydenbleasel/blume) — a zero-config,
Astro-powered docs framework. The site is fully static: landing page at `/`,
docs under `/docs`, and a changelog at `/changelog` generated from GitHub
Releases.

## Development

```bash
bun install
bun run dev        # http://localhost:3000
```

Other scripts:

```bash
bun run build      # static build to dist/
bun run type-check  # tsc --noEmit
bun run clean      # remove build output and caches
```

## Structure

- `content/` — all docs pages as Markdown/MDX, served under `/docs`. Folders
  become sidebar groups, ordered by the `meta.ts` file beside them.
- `pages/index.astro` — the custom landing page at `/`, composed from the
  sections in `components/home/` with styles in `styles/home.css`.
- `pages/2026.astro` — the year-in-review teaser at `/2026`, to be filled in
  with the full retrospective in December.
- `blume.config.ts` — site configuration: branding, theme, navigation tabs,
  analytics, code themes, content sources, and all redirects.
- `public/` — static assets (favicon, Open Graph fallback image).

## Redirects

All redirects are defined in `blume.config.ts` — not `vercel.json` — because
the Vercel adapter emits its own Build Output routing config, which takes
precedence over `vercel.json` rules:

- Legacy root docs URLs from the pre-Blume site (e.g. `/introduction`,
  `/features/log-levels`) 301 to their `/docs` counterparts.
- `/rss.xml` → `/changelog/rss.xml` (the feed moved with the changelog).
- `/2025` → `/2026` (the retired year-in-review points at the current one).

## Changelog

`/changelog` is built from the GitHub Releases of `PunGrumpy/createElogs` via
Blume's `github-releases` content source at build time. Two things keep it
healthy:

- The `docs-redeploy.yml` workflow triggers a Vercel deploy on every published
  release (requires the `VERCEL_DEPLOY_HOOK_DOCS` repository secret).
- Setting `GITHUB_TOKEN` in the Vercel environment avoids GitHub API rate
  limits during builds.

## Built-ins

Search, `llms.txt`, per-page raw Markdown (append `.md` to any URL), Open
Graph images, and the changelog RSS feed are provided by Blume out of the box.

## Deployment

`bun run build` outputs to `dist/` and deploys on Vercel via the Blume Vercel
adapter. `vercel.json` only carries project-level settings (bun version,
output directory, and the `skip-ci` ignore command).
