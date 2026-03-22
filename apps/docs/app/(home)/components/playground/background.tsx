'use client'

import Image from 'next/image'
import backgroundImage from './background.png'

export const Background = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0">
    <Image
      alt=""
      className="object-cover opacity-40 saturate-125 dark:opacity-50"
      fill
      priority={false}
      sizes="100vw"
      src={backgroundImage}
    />
  </div>
)
