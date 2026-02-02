'use client'

import Image from 'next/image'
import backgroundImage from './background.png'

export const Background = () => (
  <div className="absolute inset-0">
    <Image alt="Background" className="object-cover" src={backgroundImage} />
  </div>
)
