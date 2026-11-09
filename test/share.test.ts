import { describe, it, expect } from 'vitest'
import { encodeSnapshot, fromShareHash, deflate, inflate, toB64Url, fromB64Url } from '../src/lib/share'
import { resolveRelative } from '../src/lib/paths'
import type { Project } from '../src/types'

const mk = (name: string, files: [string, string][]): Project => ({
  id: 't-' + name,
  name,
  createdAt: 0,
  updatedAt: 0,
  files: files.map(([path, content]) => ({ path, content })),
})

// App consumes the raw hash payload, so round-trip encode→hash→decode directly.
async function roundTrip(p: Project): Promise<Project> {
  return fromShareHash(toB64Url(await deflate(encodeSnapshot(p))))
}

describe('share snapshot round-trip', () => {
  it('preserves name and files', async () => {
    const p = mk('demo', [['main.js', 'console.log(1)'], ['style.css', 'body{}']])
    const out = await roundTrip(p)
    expect(out.name).toBe('demo')
    expect(out.files.sort((a, b) => a.path.localeCompare(b.path))).toEqual(p.files.sort((a, b) => a.path.localeCompare(b.path)))
  })
  it('rejects unsafe paths', async () => {
    for (const evil of ['../secrets', '/etc/passwd', 'a/../..']) {
      const bad = JSON.stringify({ v: 1, name: 'x', files: [{ path: evil, content: 'no' }] })
      await expect(fromShareHash(toB64Url(await deflate(bad)))).rejects.toThrow('unsafe path')
    }
  })
  it('rejects corrupt snapshots', async () => {
    await expect(fromShareHash(toB64Url(await deflate('not json')))).rejects.toThrow()
    await expect(fromShareHash('!!!not-base64')).rejects.toThrow()
  })
  it('b64url is stable for binary payloads', async () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 20])
    expect(fromB64Url(toB64Url(bytes))).toEqual(bytes)
  })
})

describe('resolveRelative', () => {
  const cases: [importer: string, spec: string, expected: string][] = [
    ['main.js', './util.js', 'util.js'],
    ['main.js', '../lib/dom.js', 'lib/dom.js'],
    ['lib/ui.tsx', './button.tsx', 'lib/button.tsx'],
    ['', 'index.js', 'index.js'],
    ['a/b/c.js', './d.js', 'a/b/d.js'],
  ]
  for (const [importer, spec, expected] of cases) {
    it(`${importer} + ${spec} = ${expected}`, () => expect(resolveRelative(importer, spec)).toBe(expected))
  }
})

describe('inflate caps decompressed size', () => {
  it('throws on empty', async () => {
    await expect(inflate(new Uint8Array())).rejects.toThrow('empty snapshot')
  })
})
