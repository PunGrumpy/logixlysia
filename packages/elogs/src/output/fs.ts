import { promises as fs } from "node:fs";

/** @internal */
export const ensureDir = async (
  dirPath: string,
  mode = 0o700
): Promise<void> => {
  await fs.mkdir(dirPath, { mode, recursive: true });
};
