# 🦊 Logixlysia's documentation website

Built with [Blume](https://github.com/haydenbleasel/blume) — a zero-config,
Astro-powered docs framework.

## Development

```bash
bun install
bun run dev
```

## Structure

- `content/` — all docs pages as Markdown/MDX, served under `/docs`. Folders
  become sidebar groups, ordered by the `meta.ts` file beside them. Legacy
  root-level URLs (e.g. `/introduction`) 301 to their `/docs` counterparts.
- `pages/index.astro` — the custom landing page at `/`, composed from the
  sections in `components/home/` with styles in `styles/home.css`.
- `blume.config.ts` — site configuration (branding, theme, navigation tabs,
  analytics, redirects, code themes, content sources). The changelog at
  `/changelog` is generated from GitHub Releases of `PunGrumpy/logixlysia`
  via the `github-releases` content source.
- `public/` — static assets (favicon, Open Graph fallback image).

Search, `llms.txt`, per-page raw Markdown (append `.md` to any URL), Open Graph
images, and the changelog RSS feed (`/changelog/rss.xml`) are provided by Blume
out of the box.

## Build

```bash
bun run build
```

Outputs a static site to `dist/`, deployed on Vercel.
