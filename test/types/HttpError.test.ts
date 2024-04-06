import { describe, expect, it } from 'bun:test'
import { HttpError } from '~/types/HttpError'

describe('HttpError', () => {
  it('Should create an instance with correct status and message', () => {
    const status = 404
    const message = 'Not Found'
    const error = new HttpError(status, message)

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(HttpError)
    expect(error.status).toBe(status)
    expect(error.message).toBe(message)
  })
})
