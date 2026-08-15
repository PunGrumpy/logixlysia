#!/usr/bin/env node
// @ts-nocheck — JSDoc typedefs in .mjs are not picked up by tsc when
// invoked from the docs tsconfig; runtime behaviour is what matters here.
// Generate the `/docs/api` MDX files from typedoc JSON output.
//
// Why this exists: createElogs exports a ~75-symbol public surface, and
// hand-keeping `apps/docs/content/api/*.mdx` in sync with `src/*.ts`
// drifts. typedoc gives us an authoritative JSON dump; we slice it into
// per-topic MDX that blume can render alongside the hand-written docs.
//
// Run with `bun run typedoc` (see package.json). The script:
//   1. ensures `node_modules/typedoc/node_modules/typescript` resolves to
//      a TS 5.x copy (typedoc 0.27 still imports `ts.SyntaxKind.*` which
//      TS 7 removed — without this symlink the whole CLI crashes on import)
//   2. shells out to `typedoc --json` against packages/elogs
//   3. walks the JSON and emits 4 MDX files under
//      apps/docs/content/api/

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(DOCS_ROOT, "..", "..");
const PKG_ROOT = join(REPO_ROOT, "packages", "elogs");
const SRC_ENTRY = join(PKG_ROOT, "src", "index.ts");
const OUT_DIR = join(DOCS_ROOT, "content", "api");
const TYPEDOC_JSON = join(DOCS_ROOT, ".blume", "typedoc.json");
const TYPEDOC_TSCONFIG = join(PKG_ROOT, ".typedoc-tsconfig.json");

// ============================================================
// Step 1 — run the idempotent setup (symlink TS 5 + write tsconfig)
// ============================================================
//
// The setup script is also exposed as a postinstall hook so the symlink
// is in place before the first `blume build` even if typedoc.mjs was
// never called.

spawnSync(process.execPath, [join(__dirname, "setup-typedoc.mjs")], {
  stdio: ["ignore", "inherit", "inherit"],
});

// ============================================================
// Step 3 — run typedoc
// ============================================================

mkdirSync(dirname(TYPEDOC_JSON), { recursive: true });

const typedocBin = join(REPO_ROOT, "node_modules", "typedoc", "bin", "typedoc");
const result = spawnSync(
  process.execPath,
  [
    typedocBin,
    "--tsconfig",
    TYPEDOC_TSCONFIG,
    "--json",
    TYPEDOC_JSON,
    "--skipErrorChecking",
    SRC_ENTRY,
  ],
  {
    cwd: PKG_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  }
);

if (result.status !== 0) {
  console.error("[typedoc] failed with exit code", result.status);
  process.exit(result.status ?? 1);
}

// ============================================================
// Step 3.5 — derive the public export list from src/index.ts
// ============================================================
//
// typedoc follows every reachable symbol from the entry point, so without
// filtering we'd surface internal helpers (`buildDeriveSlot`,
// `ElogsCore`, etc.) as if they were part of the API. We parse the
// barrel in `src/index.ts` and only emit references for what is actually
// re-exported to library users.

const PUBLIC_NAMES = new Set();
{
  const barrel = readFileSync(SRC_ENTRY, "utf8");
  // Match `export { a, b as c }` and `export type { ... }` and `export const/function/class/interface/type`
  const exportGroups = [
    ...barrel.matchAll(
      /export\s+(?:type\s+)?\{([^}]+)\}\s*(?:from\s+["'][^"']+["'])?/g
    ),
  ];
  for (const m of exportGroups) {
    for (const part of m[1].split(",")) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const [_, alias] = cleaned.split(/\s+as\s+/);
      PUBLIC_NAMES.add((alias ?? cleaned).trim());
    }
  }
  // Also: `export const X`, `export function X`, `export class X`, `export interface X`, `export type X`
  for (const m of barrel.matchAll(
    /^export\s+(?:declare\s+)?(?:const|function|class|interface|type)\s+([A-Za-z_$][\w$]*)/gm
  )) {
    PUBLIC_NAMES.add(m[1]);
  }
}

// ============================================================
// Step 4 — slice the JSON into MDX
// ============================================================

const project = JSON.parse(readFileSync(TYPEDOC_JSON, "utf8"));
/** @type {TypedocNode[]} */
const all = project.children ?? [];

const KIND = {
  CLASS: 128,
  ENUM: 16,
  FUNCTION: 64,
  INTERFACE: 256,
  METHOD: 2048,
  NAMESPACE: 4,
  PROPERTY: 1024,
  TYPE_ALIAS: 2_097_152,
  VARIABLE: 32,
};

const symById = new Map();
const walk = (node) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(walk);
    return;
  }
  if (typeof node.id === "number" && node.name) {
    symById.set(node.id, node);
  }
  for (const k of Object.keys(node)) walk(node[k]);
};
walk(project);

const resolveRef = (type) => {
  if (!type || typeof type !== "object") return type;
  if (type.type === "reference" && type.id !== null) {
    return symById.get(type.id) ?? type;
  }
  return type;
};

const fmtType = (type) => {
  if (!type) return "unknown";
  const seen = new Set();
  const visit = (t) => {
    if (!t || typeof t !== "object") return String(t);
    switch (t.type) {
      case "intrinsic":
        return t.name;
      case "literal":
        return JSON.stringify(t.value);
      case "union":
        return t.types.map(visit).join(" | ");
      case "intersection":
        return t.types.map(visit).join(" & ");
      case "array":
        return `${visit(t.elementType)}[]`;
      case "tuple":
        return `[${(t.elements ?? []).map(visit).join(", ")}]`;
      case "reference": {
        const sym = resolveRef(t);
        if (sym?.name) {
          const args =
            t.typeArguments && t.typeArguments.length > 0
              ? `<${t.typeArguments.map(visit).join(", ")}>`
              : "";
          return `${sym.name}${args}`;
        }
        return t.name ?? "unknown";
      }
      case "reflection": {
        const sigs = t.declaration?.signatures ?? [];
        if (sigs.length > 0) {
          const [s, ...rest] = sigs;

          const params = (s.parameters ?? [])
            .map((p) => `${p.name}: ${visit(p.type)}`)
            .join(", ");
          return `(${params}) => ${visit(s.type)}`;
        }
        if (t.declaration?.children) {
          return "object";
        }
        return "object";
      }
      case "stringLiteral":
        return JSON.stringify(t.value);
      case "typeOperator":
        return `${t.operator} ${visit(t.target)}`;
      case "query":
        // `typeof X` query types — formatted as `typeof X`. The `queryType`
        // field holds the operand, not `target` (which the typeOperator case
        // uses). Without this branch, the default case spits back `"query"`
        // and downstream MDX turns `ReturnType<query>` into a JSX parse error.
        return `typeof ${visit(t.queryType)}`;
      case "mappedType":
        return `{ [_: ${visit(t.parameter ?? t.name)}]: ${visit(t.templateType)} }`;
      case "indexedAccess":
        return `${visit(t.objectType)}[${visit(t.indexType)}]`;
      case "conditional":
        return `${visit(t.checkType)} extends ${visit(t.extendsType)} ? ${visit(t.trueType)} : ${visit(t.falseType)}`;
      case "templateLiteral":
        return `\`${t.head ?? ""}${(t.tail ?? [])
          .map((p) => `$${p.toString()}${p.tail ?? ""}`)
          .join("")}\``;
      case "predicate":
        return `${visit(t.target)} ${t.name ?? ""}`.trim();
      case "unknown":
        return "unknown";
      case "any":
        return "any";
      case "void":
        return "void";
      case "never":
        return "never";
      case "null":
        return "null";
      case "undefined":
        return "undefined";
      case "object":
        return "Record<string, unknown>";
      default:
        if (seen.has(t)) return t.name ?? t.type;
        seen.add(t);
        return t.name ?? t.type ?? "unknown";
    }
  };
  return visit(type);
};

const fmtComment = (node) => {
  const summary = node.comment?.summary ?? [];
  return summary
    .map((part) => (part.kind === "code" ? `\`${part.text}\`` : part.text))
    .join("")
    .trim();
};

const slug = (name) => {
  // Strip backtick wrappers and parens that show up in headings like
  // `### \`createElogs\`` and `### \`__resetForTesting\`` so the anchor
  // matches what blume/fumadocs derives from the rendered heading text.
  const stripped = String(name).replace(/`/g, "").replace(/[()]/g, "");
  return stripped
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
};

const anchor = (name) => slug(name);

const fmtSignature = (sig) => {
  const params = (sig.parameters ?? [])
    .map((p) => {
      const opt = p.flags?.isOptional || p.flags?.isRest ? "?" : "";
      const rest = p.flags?.isRest ? "..." : "";
      return `${rest}${p.name}${opt}: ${fmtType(p.type)}`;
    })
    .join(", ");
  const typeParams =
    sig.typeParameters && sig.typeParameters.length > 0
      ? `<${sig.typeParameters
          .map(
            (t) =>
              t.name + (t.constraint ? ` extends ${fmtType(t.constraint)}` : "")
          )
          .join(", ")}>`
      : "";
  return `${typeParams}(${params}) => ${fmtType(sig.type)}`;
};

const fmtInterface = (node) => {
  const lines = [];
  lines.push(`### \`${node.name}\`\n`);
  const doc = fmtComment(node);
  if (doc) lines.push(`${doc}\n`);
  const props = (node.children ?? []).filter(
    (c) => c.kind === KIND.PROPERTY || c.kind === KIND.METHOD
  );
  if (props.length > 0) {
    lines.push("| Field | Type | Optional | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const p of props) {
      // MDX parses `<T>` inside table cells as JSX, which fails the build on
      // generic types like `Set<string>`. We HTML-escape the angle brackets
      // *inside* the backtick code-span; backticks alone aren't enough because
      // MDX still walks the cell text for JSX tokens.
      const escapeAngle = (s) =>
        String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const t =
        p.kind === KIND.METHOD
          ? `<code>${(p.signatures ?? [])
              .map((s) =>
                escapeAngle(
                  s.name +
                    "(" +
                    (s.parameters ?? []).map((q) => q.name).join(", ") +
                    ")"
                )
              )
              .join(" / ")}</code>`
          : `\`${escapeAngle(fmtType(p.type))}\``;
      const opt = p.flags?.isOptional ? "✓" : "";
      // Description may contain JSDoc text with generic types (`Set<string>`)
      // — escape angle brackets so MDX's JSX parser doesn't blow up.
      const desc = fmtComment(p)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      lines.push(`| \`${p.name}\` | ${t} | ${opt} | ${desc} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
};

const fmtTypeAlias = (node) => {
  const lines = [`### \`${node.name}\`\n`];
  const doc = fmtComment(node);
  if (doc) lines.push(`${doc}\n`);
  lines.push("```ts");
  lines.push(`type ${node.name} = ${fmtType(node.type)};`);
  lines.push("```\n");
  return lines.join("\n");
};

const fmtVariable = (node) => {
  const lines = [`### \`${node.name}\`\n`];
  const doc = fmtComment(node);
  if (doc) lines.push(`${doc}\n`);
  const sigs =
    node.type?.type === "reflection"
      ? (node.type.declaration?.signatures ?? [])
      : [];
  if (sigs.length > 0) {
    lines.push("```ts");
    for (const sig of sigs) {
      const params = (sig.parameters ?? [])
        .map((p) => {
          const opt = p.flags?.isOptional || p.flags?.isRest ? "?" : "";
          const rest = p.flags?.isRest ? "..." : "";
          return `${rest}${p.name}${opt}: ${fmtType(p.type)}`;
        })
        .join(", ");
      const typeParams =
        sig.typeParameters && sig.typeParameters.length > 0
          ? `<${sig.typeParameters.map((t) => t.name).join(", ")}>`
          : "";
      lines.push(
        `const ${node.name}${typeParams}: (${params}) => ${fmtType(sig.type)};`
      );
    }
    lines.push("```\n");
  } else if (node.type) {
    lines.push("```ts");
    lines.push(`const ${node.name}: ${fmtType(node.type)};`);
    lines.push("```\n");
  }
  return lines.join("\n");
};

const fmtFunction = (node) => {
  const lines = [`### \`${node.name}\`\n`];
  const doc = fmtComment(node);
  if (doc) lines.push(`${doc}\n`);
  const sigs = node.signatures ?? [];
  if (sigs.length > 0) {
    for (const sig of sigs) {
      lines.push("```ts");
      lines.push(`function ${node.name}${fmtSignature(sig)};`);
      lines.push("```");
    }
    const params = sigs[0].parameters ?? [];
    if (params.length > 0) {
      lines.push("\n**Parameters**\n");
      lines.push("| Name | Type | Description |");
      lines.push("| --- | --- | --- |");
      for (const p of params) {
        const desc = fmtComment(p).replace(/\|/g, "\\|").replace(/\n/g, " ");
        lines.push(`| \`${p.name}\` | \`${fmtType(p.type)}\` | ${desc} |`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
};

const fmtClass = (node) => {
  const lines = [`### \`${node.name}\`\n`];
  const doc = fmtComment(node);
  if (doc) lines.push(`${doc}\n`);
  if (node.children?.length) {
    lines.push("```ts");
    lines.push(`class ${node.name} {`);
    for (const c of node.children) {
      if (c.kind === KIND.PROPERTY) {
        const opt = c.flags?.isOptional ? "?" : "";
        lines.push(`  ${c.name}${opt}: ${fmtType(c.type)};`);
      } else if (c.kind === KIND.METHOD && c.signatures?.[0]) {
        const [sig, ...rest] = c.signatures;
        const params = (sig.parameters ?? [])
          .map((p) => `${p.name}: ${fmtType(p.type)}`)
          .join(", ");
        lines.push(`  ${c.name}(${params}): ${fmtType(sig.type)};`);
      }
    }
    lines.push("}");
    lines.push("```\n");
  }
  return lines.join("\n");
};

// ============================================================
// Step 5 — emit MDX
// ============================================================

mkdirSync(OUT_DIR, { recursive: true });

// YAML single-quote strings: only `'` itself needs escaping (double it).
// Without this, descriptions containing `:` + `{` (e.g. `` `createElogs({ config: { ... } })` ``)
// get parsed as flow mappings and blume dies with "bad indentation of a
// mapping entry" at frontmatter parse time.
const yamlSingleQuoted = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;

const frontmatter = (title, description) =>
  `---\ntitle: ${yamlSingleQuoted(title)}\ndescription: ${yamlSingleQuoted(description)}\n---\n\n`;

const referencesMd = (sigs) =>
  sigs.map((s) => `[${s.name}](#${anchor(s.name)})`).join(" · ");

const section = (heading, sigs) => {
  if (sigs.length === 0) return "";
  return `## ${heading}\n\n${referencesMd(sigs)}\n\n`;
};

const isPublic = (c) => PUBLIC_NAMES.has(c.name);

const functions = all.filter((c) => c.kind === KIND.FUNCTION && isPublic(c));
const variables = all.filter((c) => c.kind === KIND.VARIABLE && isPublic(c));
const interfaces = all.filter((c) => c.kind === KIND.INTERFACE && isPublic(c));
const typeAliases = all.filter(
  (c) => c.kind === KIND.TYPE_ALIAS && isPublic(c)
);
const classes = all.filter((c) => c.kind === KIND.CLASS && isPublic(c));

const exportsBody = [
  frontmatter(
    "Exports",
    "Public functions and values exported by `@pori15/elogs`."
  ),
  "本页是 [`@pori15/elogs`](https://www.npmjs.com/package/@pori15/elogs) 公共导出的自动生成参考。源代码变更后会重新生成。\n",
  section("Functions", functions),
  section("Variables", variables),
  "## Functions\n",
  ...functions.map(fmtFunction),
  "## Variables\n",
  ...variables.map(fmtVariable),
].join("\n");

writeFileSync(join(OUT_DIR, "exports.mdx"), exportsBody);

const typesBody = [
  frontmatter(
    "Types",
    "Public TypeScript types — interfaces, type aliases, and classes."
  ),
  "本页是 [`@pori15/elogs`](https://www.npmjs.com/package/@pori15/elogs) 类型导出的自动生成参考。\n",
  section("Interfaces", interfaces),
  section("Type Aliases", typeAliases),
  section("Classes", classes),
  "## Interfaces\n",
  ...interfaces.map(fmtInterface),
  "## Type Aliases\n",
  ...typeAliases.map(fmtTypeAlias),
  "## Classes\n",
  ...classes.map(fmtClass),
].join("\n");

writeFileSync(join(OUT_DIR, "types.mdx"), typesBody);

const config = all.find((c) => c.name === "ElogsConfig" && isPublic(c));
const opts = all.find((c) => c.name === "CreateElogsOptions" && isPublic(c));
const configBody = [
  frontmatter(
    "Configuration",
    "All fields accepted by `createElogs({ config: { ... } })`."
  ),
  "本页是 [`ElogsConfig`](https://github.com/eastgold15/elogs/blob/main/packages/elogs/src/interfaces.ts) 字段的自动生成参考。源代码变更后会重新生成。\n",
  "## ElogsConfig\n",
  config
    ? fmtInterface(config)
    : "_ElogsConfig not found in typedoc output._\n",
  "## CreateElogsOptions\n",
  opts
    ? fmtInterface(opts)
    : "_CreateElogsOptions not found in typedoc output._\n",
].join("\n");

writeFileSync(join(OUT_DIR, "configuration.mdx"), configBody);

const indexBody = [
  frontmatter(
    "API reference",
    "Auto-generated reference for `@pori15/elogs` exports, types, and configuration."
  ),
  "本页是 [`@pori15/elogs`](https://www.npmjs.com/package/@pori15/elogs) 的 API 参考。每当 `packages/elogs/src/*.ts` 变化,运行 `bun run typedoc` 重新生成。\n",
  "## Sections\n",
  "- [Exports](/docs/api/exports) — public functions and values",
  "- [Types](/docs/api/types) — interfaces, type aliases, classes",
  "- [Configuration](/docs/api/configuration) — every `ElogsConfig` field",
  "",
  "## At a glance\n",
  `| Kind | Count |\n| --- | --- |\n| Functions | ${functions.length} |\n| Variables | ${variables.length} |\n| Interfaces | ${interfaces.length} |\n| Type Aliases | ${typeAliases.length} |\n| Classes | ${classes.length} |\n`,
  "## Source\n",
  "Reference content is generated from [`packages/elogs/src/`](https://github.com/eastgold15/elogs/tree/main/packages/elogs/src) via [TypeDoc](https://typedoc.org/) — see `apps/docs/scripts/typedoc.mjs`.\n",
].join("\n");

writeFileSync(join(OUT_DIR, "index.mdx"), indexBody);

console.log(
  `[typedoc] wrote ${functions.length + variables.length + interfaces.length + typeAliases.length + classes.length + 1} entries to ${relative(REPO_ROOT, OUT_DIR)}/`
);
