#!/usr/bin/env node
// @ts-check
// Idempotent setup for typedoc 0.27 + TypeScript 5.x compat.
//
// typedoc 0.27 statically does `import ts from "typescript"` and reads
// `ts.SyntaxKind.*` constants that were removed in TypeScript 6/7. We
// install `typescript@^5.7` as a docs devDep and symlink it into
// `node_modules/typedoc/node_modules/typescript` so the import resolves
// to TS 5, not the workspace-root TS 7.
//
// This script is safe to re-run; it only creates the symlink if missing.
// `typedoc.mjs` calls this same logic on every invocation, but a separate
// postinstall hook also runs it so the symlink is in place before the
// first `blume build`.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(DOCS_ROOT, "..", "..");
const PKG_ROOT = join(REPO_ROOT, "packages", "elogs");
const TYPEDOC_DIR = join(REPO_ROOT, "node_modules", "typedoc");
const TYPEDOC_LOCAL_TS = join(TYPEDOC_DIR, "node_modules", "typescript");
const DOCS_LOCAL_TS = join(DOCS_ROOT, "node_modules", "typescript");
const TYPEDOC_TSCONFIG = join(PKG_ROOT, ".typedoc-tsconfig.json");

if (
  existsSync(join(TYPEDOC_DIR, "package.json")) &&
  !existsSync(TYPEDOC_LOCAL_TS) &&
  existsSync(DOCS_LOCAL_TS)
) {
  mkdirSync(dirname(TYPEDOC_LOCAL_TS), { recursive: true });
  symlinkSync(DOCS_LOCAL_TS, TYPEDOC_LOCAL_TS, "dir");
  console.log(
    `[setup-typedoc] symlinked ${DOCS_LOCAL_TS} → ${TYPEDOC_LOCAL_TS}`
  );
}

const TYPEDOC_TSCONFIG_BODY = `${JSON.stringify(
  {
    compilerOptions: {
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      isolatedModules: true,
      jsx: "preserve",
      lib: ["ES2022", "DOM"],
      module: "ESNext",
      moduleResolution: "Bundler",
      noEmit: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: false,
      target: "ES2022",
    },
    include: ["./src/**/*.ts"],
  },
  null,
  2
)}\n`;

if (
  !existsSync(TYPEDOC_TSCONFIG) ||
  readFileSync(TYPEDOC_TSCONFIG, "utf8") !== TYPEDOC_TSCONFIG_BODY
) {
  writeFileSync(TYPEDOC_TSCONFIG, TYPEDOC_TSCONFIG_BODY);
}
