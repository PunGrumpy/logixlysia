import { DocsLayout as FumadocsDocsLayout } from 'fumadocs-ui/layouts/notebook'
import { baseOptions } from '@/lib/layout'
import { source } from '@/lib/source'

const DocsLayout = async ({ children }: LayoutProps<'/[...slug]'>) => (
  <FumadocsDocsLayout
    {...baseOptions()}
    nav={{ ...baseOptions().nav }}
    sidebar={{ collapsible: false, className: 'bg-card! border-r' }}
    tree={source.pageTree}
  >
    {children}
  </FumadocsDocsLayout>
)

export default DocsLayout
