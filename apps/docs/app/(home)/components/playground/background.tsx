'use client'

import UnicornScene from 'unicornstudio-react'
import { env } from '@/env'

export const Background = () => (
  <div className="absolute inset-0">
    <UnicornScene
      height={1000}
      production={process.env.NODE_ENV === 'production'}
      projectId={env.NEXT_PUBLIC_UNICORNSTUDIO_PROJECT_ID}
      width={1500}
    />
  </div>
)
