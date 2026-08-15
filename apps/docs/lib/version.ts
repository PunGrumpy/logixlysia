import { version } from "../../../packages/elogs/package.json";

const repoUrl = "https://github.com/eastgold15/elogs";

export const getLatestVersion = (): string => version;

export const getReleaseUrl = (release: string): string =>
  `${repoUrl}/releases/tag/elogs%40${release}`;
