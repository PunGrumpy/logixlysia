const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'localhost:3000'

export const url = `${protocol}://${origin}`
