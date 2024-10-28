import { expect, test } from 'bun:test'

import { formatTimestamp } from '../../src/utils/timestamp'

test('formatTimestamp with different configurations', () => {
  const testDate = new Date('2024-01-15T14:30:45.123Z')

  // Test default format
  expect(formatTimestamp(testDate)).toBe(testDate.toISOString())

  // Test system time format
  expect(formatTimestamp(testDate, { translateTime: true })).toMatch(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/
  )

  // Test custom format
  expect(
    formatTimestamp(testDate, {
      translateTime: 'yyyy-mm-dd HH:MM:ss.SSS'
    })
  ).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)

  // Test different custom formats
  expect(
    formatTimestamp(testDate, {
      translateTime: 'HH:MM:ss'
    })
  ).toMatch(/^\d{2}:\d{2}:\d{2}$/)

  expect(
    formatTimestamp(testDate, {
      translateTime: 'yyyy/mm/dd'
    })
  ).toMatch(/^\d{4}\/\d{2}\/\d{2}$/)
})
