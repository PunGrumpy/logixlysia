import { createEnv } from '@t3-oss/env-nextjs'
import { vercel } from '@t3-oss/env-nextjs/presets-zod'
import { z } from 'zod'

export const env = createEnv({
  extends: [vercel()],
  server: {},
  client: {
    NEXT_PUBLIC_OPENPANEL_CLIENT_ID: z.string()
  },
  runtimeEnv: {
    NEXT_PUBLIC_OPENPANEL_CLIENT_ID: process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID
  }
})
