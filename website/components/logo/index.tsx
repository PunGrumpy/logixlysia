import Image, { type ImageProps } from 'next/image'
import { cn } from '@/lib/utils'
import LogoImage from './logo.svg'

type LogoProps = Omit<ImageProps, 'src' | 'alt' | 'width' | 'height'>

export const Logo = ({ ...props }: LogoProps) => (
  <Image
    alt="Logo"
    className={cn('h-4 w-auto', props.className)}
    height={48}
    src={LogoImage}
    width={204}
  />
)
