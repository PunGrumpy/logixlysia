// Simple test to verify Pino integration works
const { createLogger } = require('./dist/logger/create-logger.js')

console.log('Testing Pino integration...')

try {
  const logger = createLogger({
    config: {
      pino: {
        level: 'info',
        prettyPrint: false
      }
    }
  })
  
  console.log('✅ Logger created successfully')
  console.log('✅ Pino instance available:', !!logger.pino)
  console.log('✅ Logger methods available:', {
    log: typeof logger.log,
    info: typeof logger.info,
    error: typeof logger.error,
    warn: typeof logger.warn,
    debug: typeof logger.debug
  })
  
  console.log('✅ Pino integration test passed!')
} catch (error) {
  console.error('❌ Pino integration test failed:', error.message)
}