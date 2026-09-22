import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const createTempDir = async (prefix = 'logixlysia-'): Promise<string> =>
  await mkdtemp(path.join(tmpdir(), prefix))

export const removeTempDir = async (dir: string): Promise<void> => {
  await rm(dir, { force: true, recursive: true })
}
