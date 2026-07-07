import { DynamicLink } from 'fumadocs-core/dynamic-link'
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import type { ComponentProps } from 'react'
import { CodeBlockCopyActions } from '@/components/copy-button'

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...components,

    pre: props => (
      <CodeBlock Actions={CodeBlockCopyActions} {...props}>
        <Pre>{props.children}</Pre>
      </CodeBlock>
    ),

    a: ({ href, ...props }: ComponentProps<typeof DynamicLink>) =>
      href?.startsWith('/') ? (
        <DynamicLink {...props} href={href} />
      ) : (
        <a {...props} href={href} />
      )
  }
}
