import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const createTempDir = async (prefix = 'logixlysia-'): Promise<string> =>
  await mkdtemp(join(tmpdir(), prefix))

export const removeTempDir = async (dir: string): Promise<void> => {
  await rm(dir, { recursive: true, force: true })
}
