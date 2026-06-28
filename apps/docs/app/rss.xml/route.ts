import { Feed } from 'feed'
import { source } from '@/lib/source'
import { url } from '@/lib/url'

export const revalidate = false

export const GET = () => {
  const feed = new Feed({
    title: 'Logixlysia',
    id: url,
    link: url,
    language: 'en',
    copyright: `All rights reserved ${new Date().getFullYear()}, Noppakorn Kaewsalabnil`
  })

  for (const page of source.getPages()) {
    const data = page.data as {
      description?: string
      lastModified?: Date
      title?: string
    }

    feed.addItem({
      id: page.url,
      title: data.title ?? page.url,
      description: data.description,
      link: `${url}${page.url}`,
      date: new Date(data.lastModified ?? new Date()),
      author: [
        {
          name: 'Noppakorn Kaewsalabnil',
          link: 'https://www.pungrumpy.com'
        }
      ]
    })
  }

  const rss = feed.rss2()

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml'
    }
  })
}
