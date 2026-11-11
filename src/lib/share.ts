import { PROJECT_FORMAT, type Project } from '../types'
import { isValidPath } from './paths'

// Share snapshot codec: project → {v:1|∆deflate+base64url}#fragment.
// URL fragments survive refresh, stay out of server logs, and are capped —
// oversize projects are refused (use Export). Confidentiality: none — anyone
// with the URL has the project.

const MAX_DECOMPRESSED = 64 * 1024
const MAX_URL = 16 * 1024

export async function deflate(text: string): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  void writer.write(new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>)
  void writer.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

export async function inflate(bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0) throw new Error('empty snapshot')
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  void writer.write(bytes as Uint8Array<ArrayBuffer>)
  void writer.close()
  const buf = await new Response(ds.readable).arrayBuffer()
  if (buf.byteLength > MAX_DECOMPRESSED) throw new Error('snapshot too large')
  return new TextDecoder().decode(buf)
}

const B64URL: Record<string, string> = { '+': '-', '/': '_' }
const UNB64URL: Record<string, string> = { '-': '+', '_': '/' }

export function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/[+/=]/g, c => (c === '=' ? '' : B64URL[c] ?? c))
}

export function fromB64Url(s: string): Uint8Array {
  const sNorm = s.replace(/[-_]/g, c => UNB64URL[c])
  // padded? no — toB64Url strips padding, so only %4==1 is impossible
  if (sNorm.length % 4 === 1) throw new Error('corrupt snapshot (bad base64 length)')
  const bin = atob(sNorm.padEnd(Math.ceil(sNorm.length / 4) * 4, '='))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

interface SnapshotSchema {
  v: number
  name: string
  files: { path: string; content: string }[]
}

export function encodeSnapshot(p: Project): string { return JSON.stringify(toSchema(p)) }
function toSchema(p: Project): SnapshotSchema {
  return { v: PROJECT_FORMAT, name: p.name, files: p.files }
}

export async function toShareUrl(p: Project): Promise<string> {
  const packed = toB64Url(await deflate(encodeSnapshot(p)))
  const url = new URL(location.href)
  url.hash = packed
  if (url.href.length > MAX_URL) throw new Error('project too large to share by URL — use Export instead')
  return url.href
}

export function validateSnapshot(parsed: unknown): SnapshotSchema {
  const snap = parsed as SnapshotSchema
  if (snap.v !== PROJECT_FORMAT || !Array.isArray(snap.files) || typeof snap.name !== 'string') {
    throw new Error('unsupported or corrupt snapshot')
  }
  if (snap.files.length > 256) throw new Error('too many files in snapshot')
  for (const f of snap.files) {
    if (typeof f.path !== 'string' || typeof f.content !== 'string') throw new Error('corrupt snapshot file entry')
    if (!isValidPath(f.path)) throw new Error('unsafe path in snapshot')  }
  return snap
}

export async function fromShareHash(hash: string): Promise<Project> {
  const json = await inflate(fromB64Url(hash))
  const snap = validateSnapshot(JSON.parse(json))
  return projectFromSnapshot(snap, 'Shared project')
}

function projectFromSnapshot(snap: SnapshotSchema, fallbackName: string): Project {
  return {
    format: PROJECT_FORMAT,
    id: crypto.randomUUID(),
    name: snap.name || fallbackName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: snap.files.slice(0, 256),
  }
}

/** Export/import: full-fidelity project archive (JSON), no size cap. */
export function exportProject(p: Project): void {
  const blob = new Blob([JSON.stringify(toSchema(p), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${p.name || 'forge-project'}.forge.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function importProjectFile(file: File): Promise<Project> {
  return file.text().then(text => projectFromSnapshot(validateSnapshot(JSON.parse(text)), 'Imported project'))
}
