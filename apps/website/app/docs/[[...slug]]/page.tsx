import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle
} from 'fumadocs-ui/page'
import { notFound } from 'next/navigation'
import { source } from '@/lib/source'

interface PageProps {
  params: Promise<{ slug?: string[] }>
}

export default async function Page(props: PageProps) {
  const params = await props.params
  const page = source.getPage(params.slug)

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

export const generateMetadata = async (props: {
  params: Promise<{ slug?: string[] }>
}) => {
  const params = await props.params
  const page = source.getPage(params.slug)

  if (!page) {
    notFound()
  }

  return {
    title: `${page.data.title} | Logixlysia`,
    description: page.data.description
  }
}
