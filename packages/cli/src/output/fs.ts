import { promises as fs } from 'node:fs'

export const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true })
}
