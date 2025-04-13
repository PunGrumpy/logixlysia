import { remarkInstall } from 'fumadocs-docgen'
import { defineConfig, defineDocs } from 'fumadocs-mdx/config'

// Options: https://fumadocs.vercel.app/docs/mdx/collections#define-docs
export const { docs, meta } = defineDocs({
  dir: 'content/docs'
})

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkInstall]
  }
})
