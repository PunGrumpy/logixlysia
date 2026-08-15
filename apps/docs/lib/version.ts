import { version } from "../../../packages/createLogPlugin/package.json";

const repoUrl = "https://github.com/PunGrumpy/createLogPlugin";

export const getLatestVersion = (): string => version;

export const getReleaseUrl = (release: string): string =>
  `${repoUrl}/releases/tag/createLogPlugin%40${release}`;
