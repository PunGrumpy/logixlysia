import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { Icons } from '@/components/icons'

export const baseOptions = (): BaseLayoutProps => ({
  nav: {
    title: (
      <span className="flex items-center gap-2">
        <Icons.logo className="size-5" />
        <span className="font-semibold text-lg tracking-tight">Logixlysia</span>
      </span>
    ),
    url: '/'
  },
  links: [
    {
      text: 'Home',
      url: '/',
      active: 'url'
    },
    {
      text: 'Docs',
      url: '/introduction',
      active: 'nested-url'
    },
    {
      text: 'NPM',
      url: 'https://www.npmjs.com/package/logixlysia',
      active: 'none'
    }
  ],
  githubUrl: 'https://github.com/PunGrumpy/logixlysia',
  themeSwitch: {
    mode: 'light-dark-system'
  }
})
