import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { Icons } from "@/components/icons";

export const baseOptions = (): BaseLayoutProps => ({
  githubUrl: "https://github.com/PunGrumpy/logixlysia",
  links: [
    {
      active: "url",
      text: "Home",
      url: "/",
    },
    {
      active: "nested-url",
      text: "Docs",
      url: "/introduction",
    },
    {
      active: "none",
      text: "NPM",
      url: "https://www.npmx.dev/package/logixlysia",
    },
  ],
  nav: {
    title: (
      <span className="flex items-center gap-2">
        <Icons.logo className="size-5" />
        <span className="font-semibold text-lg tracking-tight">Logixlysia</span>
      </span>
    ),
    url: "/",
  },
  themeSwitch: {
    mode: "light-dark-system",
  },
});
