import { expect, test } from 'bun:test'
import { STATUS_CODES } from 'node:http'
import { STATUS_TEXT } from '../../src/utils/status-text'

test('lists the reason phrases node:http lists', () => {
  expect(JSON.stringify(STATUS_TEXT)).toBe(JSON.stringify(STATUS_CODES))
})
