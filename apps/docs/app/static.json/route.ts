import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb'
import type { OramaDocument } from 'fumadocs-core/search/orama-cloud'
import { source } from '@/lib/source'

export const revalidate = false

export const GET = async (): Promise<Response> => {
  const pages = source.getPages()
  const promises = pages.map(async page => {
    const items = getBreadcrumbItems(page.url, source.pageTree, {
      includePage: false,
      includeRoot: true
    })

    return {
      id: page.url,
      structured: await page.data.structuredData,
      tag: page.slugs[0],
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      breadcrumbs: items.flatMap<string>((item, i) =>
        i > 0 && typeof item.name === 'string' ? item.name : []
      )
    } as OramaDocument
  })

  return Response.json(
    (await Promise.all(promises)).filter(
      v => v !== undefined
    ) as OramaDocument[]
  )
}
