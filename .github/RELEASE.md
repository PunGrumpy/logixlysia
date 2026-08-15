# 发版规范

本项目使用 [release-please](https://github.com/googleapis/release-please) 自动管理版本号和 CHANGELOG。

## 工作流

1. 开发者按 [Conventional Commits](https://www.conventionalcommits.org/) 规范提交 commit
2. push 到 `main` 后,`release-please.yml` workflow 自动检测 commits,开/更新一个 `chore(release): vX.Y.Z` PR
3. reviewer 检查 CHANGELOG 和 `package.json#version` 正确,合并该 PR
4. release-please action 在 PR 合并时自动跑 `npm publish --provenance` 上传 npm
5. 推 tag + 开 GitHub Release

## Conventional Commits → semver 映射

| Commit 类型 | 版本号变化 |
| --- | --- |
| `feat:` | minor (X.Y.**Z**) |
| `fix:` / `perf:` | patch (X.**Y**.Z) |
| `feat!:` / `fix!:` / `<type>!:` | major (**X**.Y.Z) |
| `BREAKING CHANGE:` (在 commit body/footer) | major (**X**.Y.Z) |
| `chore:` / `docs:` / `refactor:` / `test:` / `ci:` / `build:` | 不触发版本变化(从 changelog 隐藏) |

## 与 Elysia 主版本对齐(强约定)

**`@pori15/elogs` 的 major 版本号必须与 `elysia` 的 major 版本号保持一致。**

这是为了让用户一眼就能从 `elogs` 版本号判断它依赖的 `elysia` 主版本。

### 升级 Elysia 主版本时的操作

当你把 `peerDependencies.elysia` 升到下一个 major 时,**必须**在同一 PR 里写带 `!` 的 commit,触发 release-please 算 major bump:

```bash
git commit -m "feat!: 升级到 Elysia 3.x 主版本

- peerDependencies.elysia: >=2.0.0-exp.62 → ^3.0.0
- 适配 Elysia 3 的新 API
"
```

或用 footer:

```bash
git commit -m "feat: 升级到 Elysia 3.x

BREAKING CHANGE: 升级 Elysia 主版本到 3
"
```

### Reviewer 检查清单

合并 Release PR 前,确认:
- [ ] CHANGELOG 描述准确
- [ ] `package.json#version` 的 major 与 `peerDependencies.elysia` 的 major 一致
- [ ] 没有任何遗漏的 `feat!:` 应当走 major 而走了 minor

## 本地试运行(可选)

```bash
# 不开 PR,只 dry-run 算出版本
npx -y release-please manifest-pr \
  --config-file .github/release-please-config.json \
  --manifest-file .github/.release-please-manifest.json
```

或在 root `package.json` 跑 `bun run release`。
