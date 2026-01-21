import { OpenPanelComponent } from '@openpanel/nextjs'

import type { ReactNode } from 'react'
import { env } from '@/env'

interface AnalyticsProviderProps {
  children: ReactNode
}

export const AnalyticsProvider = ({ children }: AnalyticsProviderProps) => (
  <>
    {children}
    <OpenPanelComponent
      clientId={env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID}
      disabled={process.env.NODE_ENV !== 'production'}
      trackAttributes
      trackHashChanges
      trackOutgoingLinks
      trackScreenViews
    />
  </>
)
