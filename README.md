<div align="center">
  <h1><code>🦊</code> Elogs Monorepo</h1>
  <strong>High-performance logging for Elysia 2.0 — Pino-backed, type-safe, ALS-aware</strong>
</div>

## Packages

- [`@pori15/elogs`](./packages/elogs/README.md) — Elysia 2.0 logger plugin
- [`apps/docs`](./apps/docs) — Documentation site (Astro)
- [`apps/elysia`](./apps/elysia) — Elysia example app
- [`packages/bench`](./packages/bench) — Benchmarks

## Quick Start

```bash
# 安装依赖(bun)
bun install

# 跑测试
bun test

# 构建
bun run build
```

## 发版流程(自动)

本项目用 [release-please](https://github.com/googleapis/release-please) 自动管理版本号和 CHANGELOG。

- **提交规范**: 遵循 [Conventional Commits](https://www.conventionalcommits.org/)。`feat:` 触发 minor,`fix:` / `perf:` 触发 patch,`feat!:` / `BREAKING CHANGE:` 触发 major
- **流程**: 开发者 push 到 `main` 后,`release-please.yml` workflow 自动开/更新一个 `chore(release): vX.Y.Z` PR
- **合并即发版**: reviewer 确认 CHANGELOG 和 version 正确后合并,release-please 自动 publish 到 npm
- **主版本对齐 Elysia**: 升级 Elysia 主版本时,必须在同一 PR 里写 `feat!:` 或 `BREAKING CHANGE:`,让 release-please 自动同步 major

详细约定见 [`.github/RELEASE.md`](./.github/RELEASE.md)。
