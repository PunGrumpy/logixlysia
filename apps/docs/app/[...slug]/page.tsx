import { createRelativeLink } from 'fumadocs-ui/mdx'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle
} from 'fumadocs-ui/page'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CopyMarkdown } from '@/components/copy-markdown'
import { ViewOptions } from '@/components/page-actions'
import { getLLMText, getPageImage, source } from '@/lib/source'
import { getMDXComponents } from '@/mdx-components'

const Page = async (props: PageProps<'/[...slug]'>) => {
  const { slug } = await props.params
  const page = source.getPage(slug)

  if (!page) {
    notFound()
  }

  const MDXContent = page.data.body
  const markdown = await getLLMText(page)

  return (
    <DocsPage full={page.data.full} toc={page.data.toc}>
      <DocsTitle className="font-light font-serif text-3xl md:text-4xl lg:text-5xl">
        {page.data.title}
      </DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <div className="flex flex-row flex-wrap items-center gap-2 border-b pb-6">
        <CopyMarkdown markdown={markdown} />
        <ViewOptions
          githubUrl={`https://github.com/PunGrumpy/logixlysia/blob/main/apps/docs/content/${page.path}`}
          markdownUrl={`${page.url}.mdx`}
        />
      </div>
      <DocsBody>
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page)
          })}
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
