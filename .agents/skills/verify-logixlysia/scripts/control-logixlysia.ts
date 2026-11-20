#!/usr/bin/env bun
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'

const TOOL = 'control-logixlysia'

const USAGE = `usage: ${TOOL} <action> [--run <name>] [options]

actions:
  up       create the run's work dir, link the built plugin into it
  doctor   read-only health check of the run and the build
  run      start an app from work/ on 127.0.0.1, send requests, stop it,
           and record the server's log output as evidence
           --app <file>          app module under work/ (default export: Elysia app)
           --req "<METHOD> <path> [body]"   repeatable, sent in order
           --header "<Name>: <value>"       repeatable, sent with every request
           --settle-ms <n>       wait after the last response (default 300)
           --label <slug>        names the evidence file
  down     stop a server this run left behind, delete the run dir, keep evidence`

// The served app exits 0 or with Bun's own codes; 64 (EX_USAGE) is a refusal
// that never started anything.
const REFUSAL_EXIT_CODE = 64
const RUN_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u
const LABEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/u
const REQUEST_PATTERN =
  /^(?<method>GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (?<target>\/\S*)(?: (?<body>.+))?$/su
const HEADER_PATTERN = /^(?<name>[A-Za-z0-9-]+):\s*(?<value>.*)$/u
const LISTEN_CALL = /\.listen\s*\(/u
const DEFAULT_RUN = 'default'
const DEFAULT_SETTLE_MS = 300
const READY_TIMEOUT_MS = 15_000
const READY_POLL_MS = 50
const REQUEST_TIMEOUT_MS = 30_000
const STOP_TIMEOUT_MS = 10_000
const BODY_PREVIEW_LIMIT = 2000
const FILE_CONTENT_LIMIT = 64 * 1024
const SEQUENCE_WIDTH = 2
const SERVE_ACTION = '__serve'

const REPO_ROOT = path.resolve(
  path.dirname(realpathSync(import.meta.filename)),
  '../../../..'
)
const PACKAGE_DIR = path.join(REPO_ROOT, 'packages/logixlysia')
const DIST_ENTRY = path.join(PACKAGE_DIR, 'dist/index.js')
const SOURCE_DIR = path.join(PACKAGE_DIR, 'src')
const BUILD_COMMAND = 'cd packages/logixlysia && bun run build'

class RefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RefusalError'
  }
}

const say = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

const complain = (line: string): void => {
  process.stderr.write(`${line}\n`)
}

interface RunPaths {
  evidenceDir: string
  homeDir: string
  indexFile: string
  modulesDir: string
  name: string
  readyFile: string
  runDir: string
  stateFile: string
  tmpDir: string
  workDir: string
}

interface ServerRecord {
  pid: number
  startedAt: string
}

interface RunState {
  createdAt: string
  elysiaDir: string
  repo: string
  run: string
  server: ServerRecord | null
}

const resolveRoot = (): string => {
  const configured = process.env.LGXVERIFY_ROOT ?? ''
  const root = path.resolve(
    configured === '' ? path.join(tmpdir(), 'lgxverify') : configured
  )
  if (path.parse(root).root === root) {
    throw new RefusalError('LGXVERIFY_ROOT must not be the filesystem root')
  }
  return root
}

const createRunPaths = (name: string): RunPaths => {
  if (!RUN_NAME_PATTERN.test(name)) {
    throw new RefusalError(
      `run name "${name}" must match ${RUN_NAME_PATTERN.source}`
    )
  }
  const root = resolveRoot()
  const runDir = path.join(root, 'runs', name)
  const evidenceDir = path.join(root, 'evidence', name)
  const workDir = path.join(runDir, 'work')
  return {
    evidenceDir,
    homeDir: path.join(runDir, 'home'),
    indexFile: path.join(evidenceDir, 'index.tsv'),
    modulesDir: path.join(workDir, 'node_modules'),
    name,
    readyFile: path.join(runDir, 'ready'),
    runDir,
    stateFile: path.join(runDir, 'state.json'),
    tmpDir: path.join(runDir, 'tmp'),
    workDir
  }
}

const statOrNull = async (target: string) => {
  try {
    return await stat(target)
  } catch {
    return null
  }
}

const readState = async (paths: RunPaths): Promise<RunState | null> => {
  try {
    return JSON.parse(await readFile(paths.stateFile, 'utf-8')) as RunState
  } catch {
    return null
  }
}

const writeState = async (paths: RunPaths, state: RunState): Promise<void> => {
  await writeFile(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`)
}

const requireState = async (paths: RunPaths): Promise<RunState> => {
  const state = await readState(paths)
  if (!state) {
    throw new RefusalError(
      `run "${paths.name}" is not up; run: ${TOOL} up --run ${paths.name}`
    )
  }
  return state
}

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>

const resolveElysiaDir = (): string =>
  path.dirname(Bun.resolveSync('elysia/package.json', PACKAGE_DIR))

const versionOf = (packageDir: string): string =>
  String(readJson(path.join(packageDir, 'package.json')).version ?? '?')

const realpathOrNull = (target: string): string | null => {
  try {
    return realpathSync(target)
  } catch {
    return null
  }
}

/** Replaces machine-specific prefixes so evidence can be pasted in public. */
const scrub = (text: string, paths: RunPaths): string => {
  const replacements: [string, string][] = [
    [paths.workDir, '$WORK'],
    [paths.runDir, '$RUN_DIR'],
    [paths.evidenceDir, '$EVIDENCE'],
    [REPO_ROOT, '$REPO'],
    [homedir(), '~']
  ]
  let result = text
  for (const [from, to] of replacements) {
    result = result.replaceAll(from, to)
  }
  return result
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** The command line of a live process, or '' when it cannot be read. */
const commandLineOf = (pid: number): string => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replaceAll('\0', ' ')
  } catch {
    // No procfs (macOS, BSD), so ask ps. -ww keeps a long line whole.
    const ps = Bun.spawnSync(['ps', '-ww', '-o', 'command=', '-p', String(pid)], {
      stderr: 'ignore'
    })
    return ps.success ? ps.stdout.toString() : ''
  }
}

/** True only for a serve process this helper started for this run. */
const isOurServer = (pid: number, paths: RunPaths): boolean => {
  if (!isAlive(pid)) {
    return false
  }
  // The ready file reaches the child as written, while the app path is
  // resolved first, so this still matches when the temp directory is a symlink.
  const cmdline = commandLineOf(pid)
  return cmdline.includes(SERVE_ACTION) && cmdline.includes(paths.readyFile)
}

const actionUp = async (paths: RunPaths): Promise<number> => {
  const existing = await readState(paths)
  if (existing) {
    say(`already up ${paths.name}`)
    say(`work ${paths.workDir}`)
    say(`evidence ${paths.evidenceDir}`)
    return 0
  }
  const elysiaDir = resolveElysiaDir()
  await mkdir(paths.modulesDir, { recursive: true })
  await mkdir(paths.homeDir, { recursive: true })
  await mkdir(paths.tmpDir, { recursive: true })
  await mkdir(paths.evidenceDir, { recursive: true })
  await symlink(PACKAGE_DIR, path.join(paths.modulesDir, 'logixlysia'), 'dir')
  await symlink(elysiaDir, path.join(paths.modulesDir, 'elysia'), 'dir')
  await writeState(paths, {
    createdAt: new Date().toISOString(),
    elysiaDir,
    repo: REPO_ROOT,
    run: paths.name,
    server: null
  })
  say(`ready ${paths.name}`)
  say(`work ${paths.workDir}`)
  say(`evidence ${paths.evidenceDir}`)
  return 0
}

const newestMtime = async (dir: string): Promise<number> => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const stats = await Promise.all(
    entries
      .filter(entry => entry.isFile())
      .map(entry => statOrNull(path.join(entry.parentPath, entry.name)))
  )
  return Math.max(0, ...stats.map(found => found?.mtimeMs ?? 0))
}

const gitHead = (): string => {
  const result = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    stderr: 'ignore'
  })
  return result.success ? result.stdout.toString().trim() : 'unknown'
}

const actionDoctor = async (paths: RunPaths): Promise<number> => {
  let failed = false
  const check = (ok: boolean, line: string): void => {
    say(scrub(`${ok ? 'ok  ' : 'FAIL'} ${line}`, paths))
    failed ||= !ok
  }
  const info = (line: string): void => {
    say(scrub(`info ${line}`, paths))
  }

  const state = await readState(paths)
  check(state !== null, `run ${paths.name} is up (${paths.stateFile})`)
  info(`repo HEAD ${gitHead()}`)
  info(`bun ${Bun.version}`)

  const linkedPlugin = realpathOrNull(
    path.join(paths.modulesDir, 'logixlysia')
  )
  check(
    linkedPlugin === PACKAGE_DIR,
    `work/node_modules/logixlysia -> ${linkedPlugin ?? 'missing'}`
  )
  const linkedElysia = realpathOrNull(path.join(paths.modulesDir, 'elysia'))
  check(
    linkedElysia !== null && linkedElysia === realpathOrNull(resolveElysiaDir()),
    `work/node_modules/elysia -> ${linkedElysia ?? 'missing'}`
  )
  if (linkedElysia) {
    info(`elysia ${versionOf(linkedElysia)}`)
  }
  info(`logixlysia ${versionOf(PACKAGE_DIR)} (packages/logixlysia)`)

  const dist = await statOrNull(DIST_ENTRY)
  check(dist !== null, 'packages/logixlysia/dist/index.js exists')
  if (dist) {
    const sourceMtime = await newestMtime(SOURCE_DIR)
    check(
      dist.mtimeMs >= sourceMtime,
      dist.mtimeMs >= sourceMtime
        ? 'dist/ is newer than every file in src/'
        : `dist/ is older than src/; run: ${BUILD_COMMAND}`
    )
  }

  const server = state?.server ?? null
  check(
    server === null || !isOurServer(server.pid, paths),
    server && isOurServer(server.pid, paths)
      ? `server pid ${server.pid} from an earlier run is still alive; run: ${TOOL} down --run ${paths.name}`
      : 'no server from this run is alive'
  )

  if (!failed) {
    say('doctor passed')
  }
  return failed ? 1 : 0
}

const resolveAppPath = (raw: string, paths: RunPaths): string => {
  const candidate = path.resolve(paths.workDir, raw)
  const real = realpathOrNull(candidate)
  if (!real) {
    throw new RefusalError(`app file ${raw} does not exist under work/`)
  }
  const workReal = realpathSync(paths.workDir)
  if (!real.startsWith(`${workReal}${path.sep}`)) {
    throw new RefusalError(`app file ${raw} resolves outside the run's work/`)
  }
  if (real.startsWith(`${realpathSync(paths.modulesDir)}${path.sep}`)) {
    throw new RefusalError('app file must not live in work/node_modules')
  }
  return real
}

interface RequestSpec {
  body: string | undefined
  method: string
  target: string
}

const parseRequest = (raw: string): RequestSpec => {
  const match = REQUEST_PATTERN.exec(raw)
  if (!match?.groups) {
    throw new RefusalError(
      `--req "${raw}" must look like "GET /path" or "POST /path {json}"`
    )
  }
  return {
    body: match.groups.body,
    method: match.groups.method ?? 'GET',
    target: match.groups.target ?? '/'
  }
}

const parseHeader = (raw: string): [string, string] => {
  const match = HEADER_PATTERN.exec(raw)
  if (!match?.groups) {
    throw new RefusalError(`--header "${raw}" must look like "Name: value"`)
  }
  return [match.groups.name ?? '', match.groups.value ?? '']
}

/**
 * A loopback proxy that refuses every request with 403 and remembers the
 * target, so an adapter or transport in the app can't reach the network and
 * the evidence still shows what it tried.
 */
const startBlackholeProxy = () => {
  const attempts: string[] = []
  const server = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data(socket, chunk) {
        attempts.push(chunk.toString('latin1').split('\r\n', 1)[0] ?? '')
        socket.end('HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\n\r\n')
      }
    }
  })
  return { attempts, server, url: `http://127.0.0.1:${server.port}` }
}

const serverEnv = (
  paths: RunPaths,
  proxyUrl: string
): Record<string, string> => ({
  HOME: paths.homeDir,
  HTTPS_PROXY: proxyUrl,
  HTTP_PROXY: proxyUrl,
  LGXVERIFY_SERVE: paths.name,
  NO_COLOR: '1',
  NO_PROXY: '127.0.0.1,localhost',
  PATH: process.env.PATH ?? '',
  TMPDIR: paths.tmpDir,
  XDG_CACHE_HOME: path.join(paths.homeDir, '.cache'),
  XDG_CONFIG_HOME: path.join(paths.homeDir, '.config'),
  XDG_DATA_HOME: path.join(paths.homeDir, '.local/share')
})

const waitForReady = async (
  paths: RunPaths,
  child: { exitCode: number | null },
  deadline: number
): Promise<number | null> => {
  const text = await readFile(paths.readyFile, 'utf-8').catch(() => '')
  const port = Math.trunc(Number(text))
  if (port > 0) {
    return port
  }
  if (child.exitCode !== null || Date.now() > deadline) {
    return null
  }
  await Bun.sleep(READY_POLL_MS)
  return waitForReady(paths, child, deadline)
}

interface RequestResult {
  failed: boolean
  line: string
}

const sendRequest = async (
  port: number,
  spec: RequestSpec,
  headers: [string, string][]
): Promise<RequestResult> => {
  const started = performance.now()
  try {
    const response = await fetch(`http://127.0.0.1:${port}${spec.target}`, {
      body: spec.body,
      headers: [
        ...(spec.body?.trimStart().startsWith('{') ||
        spec.body?.trimStart().startsWith('[')
          ? [['content-type', 'application/json'] as [string, string]]
          : []),
        ...headers
      ],
      method: spec.method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const text = await response.text()
    const elapsed = Math.round(performance.now() - started)
    const requestId = response.headers.get('x-request-id')
    const preview =
      text.length > BODY_PREVIEW_LIMIT
        ? `${text.slice(0, BODY_PREVIEW_LIMIT)}... (${text.length} bytes)`
        : text
    return {
      failed: false,
      line: [
        `${spec.method} ${spec.target} -> ${response.status} in ${elapsed}ms`,
        ...(requestId ? [`  x-request-id: ${requestId}`] : []),
        `  body: ${preview}`
      ].join('\n')
    }
  } catch (error) {
    return {
      failed: true,
      line: `${spec.method} ${spec.target} -> request failed: ${String(error)}`
    }
  }
}

/** Sends the requests one after another, the way a client would. */
const sendInOrder = async (
  port: number,
  specs: RequestSpec[],
  headers: [string, string][]
): Promise<RequestResult[]> => {
  const [first, ...rest] = specs
  if (!first) {
    return []
  }
  const result = await sendRequest(port, first, headers)
  return [result, ...(await sendInOrder(port, rest, headers))]
}

const collectWrittenFiles = async (
  paths: RunPaths,
  since: number,
  appPath: string
): Promise<string[]> => {
  const entries = await readdir(paths.workDir, {
    recursive: true,
    withFileTypes: true
  })
  const candidates = entries
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name))
    .filter(
      full =>
        full !== appPath && !full.startsWith(`${paths.modulesDir}${path.sep}`)
    )
  const sections = await Promise.all(
    candidates.map(async full => {
      const info = await statOrNull(full)
      if (!info || info.mtimeMs < since) {
        return null
      }
      const raw = await readFile(full, 'utf-8')
      const body =
        raw.length > FILE_CONTENT_LIMIT
          ? `${raw.slice(0, FILE_CONTENT_LIMIT)}\n... (${raw.length} bytes)`
          : raw
      return `--- file ${path.relative(paths.workDir, full)} (${info.size} bytes) ---\n${body}`
    })
  )
  return sections.filter(section => section !== null)
}

const nextSequence = async (paths: RunPaths): Promise<string> => {
  const names = await readdir(paths.evidenceDir).catch(() => [] as string[])
  const used = names
    .map(name => Math.trunc(Number(name.split('-', 1)[0])))
    .filter(n => Number.isFinite(n))
  const next = used.length === 0 ? 1 : Math.max(...used) + 1
  return String(next).padStart(SEQUENCE_WIDTH, '0')
}

const quote = (word: string): string =>
  /^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`

interface RunOptions {
  app: string
  headers: string[]
  label: string | undefined
  reqs: string[]
  settleMs: number
}

const stopServer = async (
  child: ReturnType<typeof Bun.spawn>
): Promise<string> => {
  if (child.exitCode !== null) {
    return `exited on its own with code ${child.exitCode}`
  }
  child.kill('SIGTERM')
  // A cancellable timer: a pending Bun.sleep would hold the helper open for
  // the whole timeout after the server already exited.
  const timer = new AbortController()
  const deadline = delay(STOP_TIMEOUT_MS, 'timeout', { signal: timer.signal })
  const outcome = await Promise.race([child.exited, deadline])
  timer.abort()
  await deadline.catch(() => 'aborted')
  if (outcome !== 'timeout') {
    return `stopped by SIGTERM, exit code ${outcome}`
  }
  child.kill('SIGKILL')
  const code = await child.exited
  return `did not stop within ${STOP_TIMEOUT_MS}ms of SIGTERM; SIGKILL, exit code ${code}`
}

const actionRun = async (
  paths: RunPaths,
  options: RunOptions,
  argv: string[]
): Promise<number> => {
  const state = await requireState(paths)
  if (state.server && isOurServer(state.server.pid, paths)) {
    throw new RefusalError(
      `server pid ${state.server.pid} from an earlier run is alive; run: ${TOOL} down --run ${paths.name}`
    )
  }
  if (options.reqs.length === 0) {
    throw new RefusalError('run needs at least one --req')
  }
  if (options.label !== undefined && !LABEL_PATTERN.test(options.label)) {
    throw new RefusalError(`--label must match ${LABEL_PATTERN.source}`)
  }
  const appPath = resolveAppPath(options.app, paths)
  const appSource = await readFile(appPath, 'utf-8')
  if (LISTEN_CALL.test(appSource)) {
    throw new RefusalError(
      'the app must not call .listen(); export the Elysia app and the helper listens on 127.0.0.1'
    )
  }
  const requests = options.reqs.map(parseRequest)
  const headers = options.headers.map(parseHeader)

  await rm(paths.readyFile, { force: true })
  const proxy = startBlackholeProxy()
  const startedAt = Date.now()
  const child = Bun.spawn(
    [process.execPath, import.meta.filename, SERVE_ACTION, appPath, paths.readyFile],
    {
      cwd: paths.workDir,
      env: serverEnv(paths, proxy.url),
      stderr: 'pipe',
      stdin: 'ignore',
      stdout: 'pipe'
    }
  )
  await writeState(paths, {
    ...state,
    server: { pid: child.pid, startedAt: new Date(startedAt).toISOString() }
  })
  const stdoutText = new Response(child.stdout).text()
  const stderrText = new Response(child.stderr).text()

  const port = await waitForReady(
    paths,
    child,
    Date.now() + READY_TIMEOUT_MS
  )
  const responses: string[] = []
  let failed = port === null
  if (port === null) {
    responses.push(
      `server never became ready within ${READY_TIMEOUT_MS}ms (see stderr)`
    )
  } else {
    const results = await sendInOrder(port, requests, headers)
    responses.push(...results.map(result => result.line))
    failed ||= results.some(result => result.failed)
    await Bun.sleep(options.settleMs)
  }
  const stopped = await stopServer(child)
  proxy.server.stop(true)
  await writeState(paths, { ...state, server: null })
  const [stdout, stderr] = await Promise.all([stdoutText, stderrText])
  const files = await collectWrittenFiles(paths, startedAt, appPath)

  const sequence = await nextSequence(paths)
  const slug = options.label ?? path.basename(appPath).replace(/\.[^.]+$/u, '')
  const evidenceFile = path.join(paths.evidenceDir, `${sequence}-${slug}.txt`)
  const stdoutFile = path.join(paths.evidenceDir, `${sequence}-${slug}.stdout.log`)
  const command = [TOOL, ...argv].map(quote).join(' ')
  const report = scrub(
    [
      `command: ${command}`,
      `repo HEAD: ${gitHead()}`,
      `logixlysia: ${versionOf(PACKAGE_DIR)}, elysia: ${versionOf(state.elysiaDir)}, bun: ${Bun.version}`,
      `app: ${appPath}`,
      `--- app source ---\n${appSource.trimEnd()}`,
      `--- requests (127.0.0.1:${port ?? '-'}) ---\n${responses.join('\n')}`,
      `--- server stdout ---\n${stdout.trimEnd()}`,
      `--- server stderr ---\n${stderr.trimEnd()}`,
      `--- server stop ---\n${stopped}`,
      `--- outbound requests blocked by the loopback proxy ---\n${proxy.attempts.length === 0 ? 'none' : proxy.attempts.join('\n')}`,
      ...files,
      `--- result ---\n${failed ? 'FAIL' : 'ok'}`
    ].join('\n'),
    paths
  )
  await writeFile(evidenceFile, `${report}\n`)
  await writeFile(stdoutFile, scrub(stdout, paths))
  await appendFile(
    paths.indexFile,
    `${new Date().toISOString()}\t${failed ? 'FAIL' : 'ok'}\t${path.basename(evidenceFile)}\t${scrub(command, paths)}\n`
  )
  say(report)
  complain(`evidence ${evidenceFile}`)
  return failed ? 1 : 0
}

/** Runs inside the child: imports the app and listens on loopback only. */
const actionServe = async (appPath: string, readyFile: string): Promise<number> => {
  if (!process.env.LGXVERIFY_SERVE) {
    throw new RefusalError(`${SERVE_ACTION} is internal to ${TOOL} run`)
  }
  const mod = (await import(appPath)) as {
    app?: unknown
    default?: unknown
  }
  const app = (mod.default ?? mod.app) as
    | {
        listen: (options: { hostname: string; port: number }) => unknown
        server?: { port?: number } | null
        stop: () => Promise<unknown>
      }
    | undefined
  if (!app || typeof app.listen !== 'function') {
    complain(`${TOOL}: ${appPath} must export an Elysia app (default or "app")`)
    return 1
  }
  process.once('SIGTERM', async () => {
    try {
      await app.stop()
      process.exit(0)
    } catch (error) {
      complain(`${TOOL}: app.stop() failed: ${String(error)}`)
      process.exit(1)
    }
  })
  app.listen({ hostname: '127.0.0.1', port: 0 })
  writeFileSync(readyFile, String(app.server?.port ?? 0))
  return -1
}

const actionDown = async (paths: RunPaths): Promise<number> => {
  const state = await readState(paths)
  const server = state?.server ?? null
  if (server && isOurServer(server.pid, paths)) {
    process.kill(server.pid, 'SIGKILL')
    say(`killed server pid ${server.pid} left by this run`)
  }
  await rm(paths.runDir, { force: true, recursive: true })
  say(`removed ${paths.runDir}`)
  const kept = await statOrNull(paths.evidenceDir)
  say(
    kept
      ? `kept evidence ${paths.evidenceDir}`
      : `no evidence was recorded for ${paths.name}`
  )
  return 0
}

const main = (argv: string[]): Promise<number> => {
  const [action, ...rest] = argv
  if (action === SERVE_ACTION) {
    const [appPath, readyFile] = rest
    if (!(appPath && readyFile)) {
      throw new RefusalError(`${SERVE_ACTION} needs an app path and a ready file`)
    }
    return actionServe(appPath, readyFile)
  }
  const { values } = parseArgs({
    allowPositionals: false,
    args: rest,
    options: {
      app: { type: 'string' },
      header: { multiple: true, type: 'string' },
      help: { short: 'h', type: 'boolean' },
      label: { type: 'string' },
      req: { multiple: true, type: 'string' },
      run: { type: 'string' },
      'settle-ms': { type: 'string' }
    },
    strict: true
  })
  if (values.help || action === undefined || action === 'help') {
    say(USAGE)
    return Promise.resolve(0)
  }
  const paths = createRunPaths(values.run ?? DEFAULT_RUN)
  switch (action) {
    case 'up': {
      return actionUp(paths)
    }
    case 'doctor': {
      return actionDoctor(paths)
    }
    case 'run': {
      if (!values.app) {
        throw new RefusalError('run needs --app <file under work/>')
      }
      const settleMs = Number(values['settle-ms'] ?? DEFAULT_SETTLE_MS)
      if (!(Number.isInteger(settleMs) && settleMs >= 0)) {
        throw new RefusalError('--settle-ms must be a non-negative integer')
      }
      return actionRun(
        paths,
        {
          app: values.app,
          headers: values.header ?? [],
          label: values.label,
          reqs: values.req ?? [],
          settleMs
        },
        argv
      )
    }
    case 'down': {
      return actionDown(paths)
    }
    default: {
      throw new RefusalError(`unknown action "${action}"\n${USAGE}`)
    }
  }
}

try {
  const code = await main(process.argv.slice(2))
  if (code >= 0) {
    process.exitCode = code
  }
} catch (error) {
  const isArgError =
    error instanceof TypeError &&
    String((error as { code?: unknown }).code).startsWith('ERR_PARSE_ARGS')
  if (error instanceof RefusalError || isArgError) {
    complain(`${TOOL}: refused: ${error.message}`)
    process.exitCode = REFUSAL_EXIT_CODE
  } else {
    throw error
  }
}
