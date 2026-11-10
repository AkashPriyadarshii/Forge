import { describe, it, expect } from 'vitest'
import { isValidPath, resolveRelative } from '../src/lib/paths'
import { fromB64Url, validateSnapshot } from '../src/lib/share'

describe('isValidPath', () => {
  it('accepts normal paths', () => {
    expect(isValidPath('index.html')).toBe(true)
    expect(isValidPath('utils/helpers.ts')).toBe(true)
  })
  it('rejects traversal, absolute, backslash, empty', () => {
    expect(isValidPath('../x')).toBe(false)
    expect(isValidPath('a/../b')).toBe(false)
    expect(isValidPath('/abs')).toBe(false)
    expect(isValidPath('a\\b')).toBe(false)
    expect(isValidPath('')).toBe(false)
  })
})

describe('fromB64Url corruption', () => {
  it('rejects bad base64 (impossible length)', () => {
    expect(() => fromB64Url('abcde')).toThrow(/bad base64/)
  })
})

describe('validateSnapshot', () => {
  const snap = (files: unknown) => ({ v: 1, name: 'n', files })

  it('rejects pathological paths and oversize', () => {
    expect(() => validateSnapshot(snap([{ path: '../x', content: 'a' }]))).toThrow(/unsafe path/)
    expect(() => validateSnapshot(snap([{ path: 'a', content: 'c' }]))).not.toThrow()
    expect(() => validateSnapshot(snap(Array.from({ length: 257 }, (_, i) => ({ path: `f${i}`, content: '' }))))).toThrow(/too many/)
  })
  it('rejects malformed snapshot shapes', () => {
    expect(() => validateSnapshot({ v: 2, name: 'n', files: [] })).toThrow(/unsupported/)
    expect(() => validateSnapshot(snap(['str']))).toThrow(/corrupt/)
  })
})
