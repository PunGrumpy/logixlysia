import { version } from "../../../packages/createElogs/package.json";

const repoUrl = "https://github.com/PunGrumpy/createElogs";

export const getLatestVersion = (): string => version;

export const getReleaseUrl = (release: string): string =>
  `${repoUrl}/releases/tag/createElogs%40${release}`;
