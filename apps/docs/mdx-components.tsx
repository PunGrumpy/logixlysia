import { DynamicLink } from 'fumadocs-core/dynamic-link'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import type { ComponentProps } from 'react'

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...components,

    a: ({ href, ...props }: ComponentProps<typeof DynamicLink>) =>
      href?.startsWith('/') ? (
        <DynamicLink {...props} href={href} />
      ) : (
        <a {...props} href={href} />
      )
  }
}
