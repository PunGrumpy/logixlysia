# 🦊 Logixlysia's documentation website

Built with [Blume](https://github.com/haydenbleasel/blume) — a zero-config,
Astro-powered docs framework.

## Development

```bash
bun install
bun run dev
```

## Structure

- `content/` — all pages as Markdown/MDX. `content/index.mdx` is the homepage;
  folders become sidebar groups, ordered by the `meta.ts` file beside them.
- `blume.config.ts` — site configuration (branding, code themes, content
  sources). The changelog at `/changelog` is generated from GitHub Releases of
  `PunGrumpy/logixlysia` via the `github-releases` content source.
- `public/` — static assets (favicon, Open Graph fallback image).

Search, `llms.txt`, per-page raw Markdown (append `.md` to any URL), Open Graph
images, and the changelog RSS feed (`/changelog/rss.xml`) are provided by Blume
out of the box.

## Build

```bash
bun run build
```

Outputs a static site to `dist/`, deployed on Vercel.
