import { Databuddy } from '@databuddy/sdk/react'
import type { ReactNode } from 'react'
import { env } from '@/env'

interface AnalyticsProviderProps {
  children: ReactNode
}

export const AnalyticsProvider = ({ children }: AnalyticsProviderProps) => (
  <>
    {children}
    <Databuddy
      clientId={env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID}
      disabled={process.env.NODE_ENV !== 'production'}
      enableBatching
      trackAttributes
      trackHashChanges
      trackInteractions
      trackOutgoingLinks
      trackPerformance
      trackScrollDepth
      trackWebVitals
    />
  </>
)
