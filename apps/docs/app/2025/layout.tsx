import type { Metadata } from 'next'
import { createMetadata } from '@/lib/metadata'

export const metadata: Metadata = createMetadata(
  '2025 Wrapped | Logixlysia',
  "A celebration of everything we built together in 2025. From the first commit to the latest feature, here's your journey with Logixlysia."
)

interface LayoutProps {
  readonly children: React.ReactNode
}

const Wrapped2025Layout = ({ children }: LayoutProps) => (
  <main className="grid gap-40 pb-24 md:gap-48 md:pb-32">{children}</main>
)

export default Wrapped2025Layout
