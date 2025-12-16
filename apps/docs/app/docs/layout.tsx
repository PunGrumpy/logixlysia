import { DocsLayout as FumadocsDocsLayout } from 'fumadocs-ui/layouts/notebook'
import { baseOptions } from '@/lib/layout'
import { source } from '@/lib/source'

const DocsLayout = async ({ children }: LayoutProps<'/docs'>) => (
  <FumadocsDocsLayout
    {...baseOptions()}
    nav={{ ...baseOptions().nav, mode: 'top' }}
    sidebar={{ collapsible: false, className: 'bg-card! border-r' }}
    tabMode="navbar"
    tree={source.pageTree}
  >
    {children}
  </FumadocsDocsLayout>
)

export default DocsLayout
