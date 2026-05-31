'use client'

import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

export const MotionProvider = ({ children }: { children: ReactNode }) => (
  <MotionConfig reducedMotion="user">{children}</MotionConfig>
)
