import { version } from "../../../packages/logixlysia/package.json";

const repoUrl = "https://github.com/PunGrumpy/logixlysia";

export const getLatestVersion = (): string => version;

export const getReleaseUrl = (release: string): string =>
  `${repoUrl}/releases/tag/logixlysia%40${release}`;
