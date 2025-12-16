import { HomeLayout as FumadocsHomeLayout } from 'fumadocs-ui/layouts/home'
import { baseOptions } from '@/lib/layout'

const HomeLayout = ({ children }: LayoutProps<'/'>) => (
  <FumadocsHomeLayout {...baseOptions()}>
    <div className="relative mx-auto grid w-full max-w-(--fd-layout-width) gap-24 px-4 sm:gap-32">
      {children}
    </div>
  </FumadocsHomeLayout>
)

export default HomeLayout
