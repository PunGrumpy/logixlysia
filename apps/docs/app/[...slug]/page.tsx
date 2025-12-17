import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle
} from 'fumadocs-ui/page'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPageImage, source } from '@/lib/source'

const Page = async (props: PageProps<'/[...slug]'>) => {
  const { slug } = await props.params
  const page = source.getPage(slug)

  if (!page) {
    notFound()
  }

  const MDXContent = page.data.body

  return (
    <DocsPage
      full={page.data.full}
      tableOfContent={{
        style: 'clerk'
      }}
      toc={page.data.toc}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDXContent
          components={{
            ...defaultMdxComponents,
            Tab,
            Tabs
          }}
        />
      </DocsBody>
    </DocsPage>
  )
}

export const generateStaticParams = () => source.generateParams()

export const generateMetadata = async (
  props: PageProps<'/[...slug]'>
): Promise<Metadata> => {
  const { slug } = await props.params
  const page = source.getPage(slug)

  if (!page) {
    return {}
  }

  const { url } = getPageImage(page)

  return {
    title: `${page.data.title} | Logixlysia`,
    description: page.data.description,
    openGraph: {
      title: `${page.data.title} | Logixlysia`,
      description: page.data.description,
      images: [{ url, width: 1200, height: 630 }]
    },
    twitter: {
      creator: '@PunGrumpy',
      card: 'summary_large_image',
      images: [{ url, width: 1200, height: 630 }],
      title: `${page.data.title} | Logixlysia`,
      description: page.data.description
    }
  }
}

export default Page
