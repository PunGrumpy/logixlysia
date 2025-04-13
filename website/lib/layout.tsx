import { Logo } from '@/components/logo'
import { source } from '@/lib/source'
import { GithubInfo } from 'fumadocs-ui/components/github-info'
import type { DocsLayoutProps } from 'fumadocs-ui/layouts/notebook'

export const layout: DocsLayoutProps = {
  tree: source.pageTree,
  nav: {
    mode: 'top',
    title: <Logo />,
    transparentMode: 'always'
  },
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
    },
    {
      type: 'custom',
      children: (
        <GithubInfo owner="PunGrumpy" repo="logixlysia" className="lg:-mx-2" />
      )
    }
  ],
  tabMode: 'navbar',
  sidebar: {
    collapsible: false
  }
}
