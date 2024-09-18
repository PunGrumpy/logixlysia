import { mock } from 'bun:test'

export const mockAppend = mock(() => Promise.resolve())
export const mockMkdir = mock(() => Promise.resolve())

export const promises = {
  appendFile: mockAppend,
  mkdir: mockMkdir
}
