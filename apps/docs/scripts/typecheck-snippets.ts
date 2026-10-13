import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Glob, spawn } from 'bun'

// Review alone has not kept the pages true to the package, so every ```ts
// block compiles against packages/logixlysia/src and a renamed option or a
// dropped export fails CI instead of a reader's build. `check=skip` exempts a
// sketch, and `check=expect-errors` requires a block that shows a compile
// error on purpose to keep failing. Markers contain `=` because Blume shows
// the first bare token after the language as the block's title.

const DOCS_DIR = path.resolve(import.meta.dir, '..')
const REPO_DIR = path.resolve(DOCS_DIR, '../..')
const CONTENT_DIR = path.join(DOCS_DIR, 'content')
const SNIPPETS_DIR = path.join(DOCS_DIR, '.snippets')
const PACKAGE_SRC = path.join(REPO_DIR, 'packages/logixlysia/src')
const TSC = path.join(REPO_DIR, 'node_modules/.bin/tsc')

const MARKERS = new Set(['config', 'expect-errors', 'skip'])

const FENCE_OPEN = /^(?<indent> {0,3})(?<fence>`{3,})(?<info>[^`]*)$/u
const FENCE_CLOSE = /^ {0,3}(?<fence>`{3,})\s*$/u
const LEADING_SPACES = /^ */u
const WHITESPACE = /\s+/u
const TS_LANGUAGE = /^(?:ts|typescript|tsx)$/u
const MARKER = /^check=(?<value>.*)$/u
const MDX_EXTENSION = /\.mdx$/u
const MODULE_STATEMENT = /^(?:import|export)\s/mu
const CONFIG_MEMBER = /^\s*[A-Za-z_$][\w$]*\??\s*:\s/u
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/u
const IDENTIFIER = /[A-Za-z_$][\w$]*/gu
const DECLARATION =
  /\b(?:class|const|enum|function|interface|let|namespace|type|var)\s+(?<name>[A-Za-z_$][\w$]*)/gu
const DESTRUCTURING =
  /\b(?:const|let|var)\s*(?<pattern>\{[^}]*\}|\[[^\]]*\])\s*=/gu
const DIAGNOSTIC_LINE = /^(?:\S.*: )?error TS\d+: /u
const SNIPPET_DIAGNOSTIC =
  /^(?<file>src\/[^(]+)\((?<line>\d+),\d+\): error TS(?<code>\d+): (?<message>.*)$/u

// TS1xxx are parser errors. While any file has one, tsc reports no type error
// anywhere, so every other block would pass unchecked.
const FIRST_NON_SYNTAX_CODE = 2000
const FIRST_SYNTAX_CODE = 1000

interface PreludeImport {
  defaultName?: string
  from: string
  names: string[]
  typeOnly?: boolean
}

// A fragment assumes the imports a reader's file would have. It gets only the
// names it uses and does not declare itself; a false match from the
// identifier scan adds an unused import, which tsc accepts.
const PRELUDE: PreludeImport[] = [
  {
    defaultName: 'logixlysia',
    from: 'logixlysia',
    names: ['createLogger', 'flushLogixlysia', 'HttpError', 'useLogger']
  },
  {
    from: 'logixlysia',
    names: [
      'Logger',
      'LogixlysiaStore',
      'LogLevel',
      'Options',
      'Pino',
      'Transport'
    ],
    typeOnly: true
  },
  { from: 'elysia', names: ['Elysia', 'status', 't'] },
  {
    from: 'logixlysia/enrichers',
    names: [
      'geoEnricher',
      'sizeEnricher',
      'traceparentEnricher',
      'userAgentEnricher'
    ]
  },
  { from: 'logixlysia/axiom', names: ['createAxiomTransport'] },
  { from: 'logixlysia/better-stack', names: ['createBetterStackTransport'] },
  { from: 'logixlysia/clickhouse', names: ['createClickHouseTransport'] },
  { from: 'logixlysia/datadog', names: ['createDatadogTransport'] },
  { from: 'logixlysia/hyperdx', names: ['createHyperDXTransport'] },
  { from: 'logixlysia/loki', names: ['createLokiTransport'] },
  { from: 'logixlysia/otlp', names: ['createOtlpTransport'] },
  { from: 'logixlysia/posthog', names: ['createPostHogTransport'] },
  { from: 'logixlysia/sentry', names: ['createSentryTransport'] },
  { from: 'logixlysia/desertant', names: ['withRedaction'] },
  {
    from: 'logixlysia/desertant',
    names: ['NeuralCallOptions'],
    typeOnly: true
  },
  { from: '@desert-ant-labs/redact/native', names: ['Redact'] }
]

const GLOBALS = `import type { Logger, LogixlysiaStore, Pino, Transport } from 'logixlysia'

declare global {
  var app: import('logixlysia').Logixlysia
  var plugin: ReturnType<typeof import('logixlysia').logixlysia>
  var request: Request
  var store: LogixlysiaStore
  var logger: Logger
  var pino: Pino
  var transport: Transport
  var options: import('logixlysia').Options
  var log: import('logixlysia').RequestScopedLogger
  // Names the docs use as placeholders for the reader's own code.
  var db: any
  var metrics: any
  var customTransport: Transport
  var myTransport: Transport
  var elasticsearchTransport: Transport
  var slackTransport: Transport
  var mongodbTransport: Transport
  var myDrain: any
  var myEnricher: any
  var sendToService: (...args: any[]) => any
  var getProfile: (...args: any[]) => any
  var getUserById: (...args: any[]) => any
  var getOrder: (...args: any[]) => any
  var createUser: (...args: any[]) => any
  var processData: (...args: any[]) => any
  var performRiskyOperation: (...args: any[]) => any
  var generateId: () => string
  var newUser: any
  var user: any
  var order: any
  var userId: string
}

export {}
`

// A script, not a module: inside a module this would be an augmentation, and
// tsc drops an augmentation of a module it cannot resolve without a word.
const MODULES = `declare module '@desert-ant-labs/redact/native'
`

const TSCONFIG = {
  compilerOptions: {
    allowImportingTsExtensions: true,
    module: 'ESNext',
    moduleResolution: 'Bundler',
    noEmit: true,
    // Handler parameters in a standalone block have no contextual type.
    noImplicitAny: false,
    paths: {
      logixlysia: [path.join(PACKAGE_SRC, 'index.ts')],
      'logixlysia/*': [path.join(PACKAGE_SRC, '*.ts')]
    },
    skipLibCheck: true,
    strict: true,
    target: 'ESNext',
    types: ['bun-types']
  },
  include: ['src/**/*.ts']
}

type Kind = 'chained' | 'config' | 'fragment' | 'module'

interface Block {
  code: string
  // Page line of the block's first line of code.
  line: number
  marker: string | undefined
  n: number
  page: string
}

interface OpenFence {
  fence: string
  indent: number
  info: string
  line: number
}

interface Snippet {
  block: Block
  file: string
  // Wrapper lines above the block's own first line.
  header: number
  text: string
}

interface Diagnostic {
  code: number
  line: number
  message: string
}

const dedent = (line: string, indent: number): string =>
  line.slice(Math.min(indent, LEADING_SPACES.exec(line)?.[0].length ?? 0))

const toBlock = (
  page: string,
  open: OpenFence,
  body: string[],
  n: number
): Block => {
  const [, ...tokens] = open.info.trim().split(WHITESPACE)
  return {
    code: body.join('\n'),
    line: open.line,
    marker: tokens
      .map(token => MARKER.exec(token)?.groups?.value)
      .find(value => value !== undefined),
    n,
    page
  }
}

const isTypeScript = (open: OpenFence): boolean => {
  const [language = ''] = open.info.trim().split(WHITESPACE)
  return TS_LANGUAGE.test(language)
}

// Every fence is tracked, whatever its language, so a ```ts line inside
// another block is not mistaken for an opening fence.
const extractBlocks = (page: string, source: string): Block[] => {
  const blocks: Block[] = []
  let open: OpenFence | undefined
  let body: string[] = []
  for (const [index, line] of source.split('\n').entries()) {
    if (open) {
      const close = FENCE_CLOSE.exec(line)?.groups?.fence ?? ''
      if (close.length >= open.fence.length) {
        if (isTypeScript(open)) {
          blocks.push(toBlock(page, open, body, blocks.length + 1))
        }
        open = undefined
      } else {
        body.push(dedent(line, open.indent))
      }
      continue
    }
    const groups = FENCE_OPEN.exec(line)?.groups
    if (groups) {
      open = {
        fence: groups.fence ?? '',
        indent: groups.indent?.length ?? 0,
        info: groups.info ?? '',
        line: index + 2
      }
      body = []
    }
  }
  return blocks
}

const kindOf = (block: Block): Kind => {
  if (block.marker === 'config') {
    return 'config'
  }
  if (MODULE_STATEMENT.test(block.code)) {
    return 'module'
  }
  const first =
    block.code
      .split('\n')
      .find(line => line.trim() !== '' && !COMMENT.test(line)) ?? ''
  if (CONFIG_MEMBER.test(first)) {
    return 'config'
  }
  if (first.trimStart().startsWith('.')) {
    return 'chained'
  }
  return 'fragment'
}

const declaredIn = (code: string): Set<string> => {
  const names = new Set<string>()
  for (const { groups } of code.matchAll(DECLARATION)) {
    names.add(groups?.name ?? '')
  }
  for (const { groups } of code.matchAll(DESTRUCTURING)) {
    for (const name of groups?.pattern?.match(IDENTIFIER) ?? []) {
      names.add(name)
    }
  }
  return names
}

const preludeFor = (code: string): string[] => {
  const used = new Set(code.match(IDENTIFIER))
  const declared = declaredIn(code)
  const needs = (name: string): boolean => used.has(name) && !declared.has(name)
  return PRELUDE.flatMap(({ defaultName = '', from, names, typeOnly }) => {
    const named = names.filter(needs)
    const clauses = [
      ...(needs(defaultName) ? [defaultName] : []),
      ...(named.length > 0 ? [`{ ${named.join(', ')} }`] : [])
    ]
    if (clauses.length === 0) {
      return []
    }
    const keyword = typeOnly ? 'import type' : 'import'
    return [`${keyword} ${clauses.join(', ')} from '${from}'`]
  })
}

// The trailing `export {}` makes each block a module, so a block's own
// `const app` shadows the global one instead of clashing with it.
const wrap = (block: Block, kind: Kind): { head: string[]; tail: string[] } => {
  if (kind === 'config') {
    return {
      head: [
        "import type { Options } from 'logixlysia'",
        "const snippet: NonNullable<Options['config']> = {"
      ],
      tail: ['}', 'export {}', '']
    }
  }
  const prelude = preludeFor(block.code)
  return {
    head: kind === 'chained' ? [...prelude, 'app'] : prelude,
    tail: ['export {}', '']
  }
}

const toSnippet = (block: Block): Snippet => {
  const slug = block.page.replace(MDX_EXTENSION, '').replaceAll('/', '-')
  const file = `${slug}__${block.n}.ts`
  const kind = kindOf(block)
  if (kind === 'module') {
    return { block, file, header: 0, text: `${block.code}\n` }
  }
  const { head, tail } = wrap(block, kind)
  return {
    block,
    file,
    header: head.length,
    text: [...head, block.code, ...tail].join('\n')
  }
}

const label = (block: Block): string => `${block.page}#${block.n}`

const describe = (snippet: Snippet, diagnostic: Diagnostic): string => {
  const last = snippet.block.code.split('\n').length - 1
  const offset = diagnostic.line - 1 - snippet.header
  const line = snippet.block.line + Math.min(Math.max(offset, 0), last)
  return `${label(snippet.block)} (line ${line}): TS${diagnostic.code} ${diagnostic.message}`
}

const isSyntaxError = (diagnostic: Diagnostic): boolean =>
  diagnostic.code >= FIRST_SYNTAX_CODE &&
  diagnostic.code < FIRST_NON_SYNTAX_CODE

const fail = (reason: string, lines: string[]): never => {
  console.error(reason)
  for (const line of lines) {
    console.error(`  ${line}`)
  }
  process.exit(1)
}

const pages = [...new Glob('**/*.mdx').scanSync(CONTENT_DIR)].toSorted()
const sources = await Promise.all(
  pages.map(async page => ({
    page,
    source: await readFile(path.join(CONTENT_DIR, page), 'utf-8')
  }))
)
const blocks = sources.flatMap(({ page, source }) =>
  extractBlocks(page, source)
)

const unknownMarkers = blocks.filter(
  block => block.marker !== undefined && !MARKERS.has(block.marker)
)
if (unknownMarkers.length > 0) {
  fail(
    'Unknown check= marker; use check=skip, check=expect-errors or check=config:',
    unknownMarkers.map(block => `${label(block)}: check=${block.marker}`)
  )
}

const snippets = blocks.filter(block => block.marker !== 'skip').map(toSnippet)

await rm(SNIPPETS_DIR, { force: true, recursive: true })
await mkdir(path.join(SNIPPETS_DIR, 'src'), { recursive: true })
await Promise.all([
  writeFile(
    path.join(SNIPPETS_DIR, 'tsconfig.json'),
    `${JSON.stringify(TSCONFIG, null, 2)}\n`
  ),
  writeFile(path.join(SNIPPETS_DIR, 'src/globals.d.ts'), GLOBALS),
  writeFile(path.join(SNIPPETS_DIR, 'src/modules.d.ts'), MODULES),
  ...snippets.map(snippet =>
    writeFile(path.join(SNIPPETS_DIR, 'src', snippet.file), snippet.text)
  )
])

const tsc = spawn([TSC, '-p', 'tsconfig.json', '--pretty', 'false'], {
  cwd: SNIPPETS_DIR,
  stderr: 'pipe',
  stdout: 'pipe'
})
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(tsc.stdout).text(),
  new Response(tsc.stderr).text(),
  tsc.exited
])

const byFile = new Map<string, Snippet>(
  snippets.map(snippet => [`src/${snippet.file}`, snippet])
)
const errors = new Map<Snippet, Diagnostic[]>()
const outside: string[] = []
for (const line of stdout.split('\n')) {
  if (!DIAGNOSTIC_LINE.test(line)) {
    continue
  }
  const groups = SNIPPET_DIAGNOSTIC.exec(line)?.groups
  const snippet = byFile.get(groups?.file ?? '')
  if (!(groups && snippet)) {
    outside.push(line)
    continue
  }
  const found = errors.get(snippet) ?? []
  found.push({
    code: Number(groups.code),
    line: Number(groups.line),
    message: groups.message ?? ''
  })
  errors.set(snippet, found)
}

if (outside.length > 0) {
  fail(
    'tsc reported errors outside the doc blocks. An options or global error stops it before the type check, so fix these first:',
    outside
  )
}

const syntaxErrors = [...errors].flatMap(([snippet, found]) =>
  found.filter(isSyntaxError).map(diagnostic => describe(snippet, diagnostic))
)
if (syntaxErrors.length > 0) {
  fail(
    'A block does not parse, and tsc type-checks no block while one does:',
    syntaxErrors
  )
}

if (exitCode !== 0 && errors.size === 0) {
  fail(
    `tsc exited with code ${exitCode} without reporting an error in any block:`,
    `${stdout}${stderr}`.trim().split('\n')
  )
}

let unexpected = 0
let silent = 0
for (const snippet of snippets) {
  const found = errors.get(snippet) ?? []
  const [first] = found
  if (snippet.block.marker === 'expect-errors') {
    if (!first) {
      console.log(`${label(snippet.block)}: expected a compile error, got none`)
      silent += 1
    }
    continue
  }
  if (first) {
    unexpected += found.length
    const more = found.length > 1 ? ` (+${found.length - 1} more)` : ''
    console.log(`${describe(snippet, first)}${more}`)
  }
}

const expected = snippets.filter(
  snippet => snippet.block.marker === 'expect-errors'
).length
console.log(
  `checked ${snippets.length} blocks, skipped ${blocks.length - snippets.length}, expected-errors ${expected}, ${unexpected} unexpected errors`
)
process.exit(unexpected > 0 || silent > 0 ? 1 : 0)
