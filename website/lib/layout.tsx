import { Logo } from '@/components/logo'
import { source } from '@/lib/source'
import type { DocsLayoutProps } from 'fumadocs-ui/layouts/notebook'

export const layout: DocsLayoutProps = {
  tree: source.pageTree,
  nav: {
    mode: 'top',
    title: <Logo />,
    transparentMode: 'always'
  },
  githubUrl: 'https://github.com/PunGrumpy/logixlysia',
  disableThemeSwitch: true,
  links: [
    {
      text: 'Home',
      url: '/',
      active: 'url'
    },
    {
      text: 'Docs',
      url: '/docs',
      active: 'nested-url'
    },
    {
      text: 'NPM',
      url: 'https://www.npmjs.com/package/logixlysia',
      active: 'none'
    }
  ],
  tabMode: 'navbar',
  sidebar: {
    collapsible: false
  }
}
