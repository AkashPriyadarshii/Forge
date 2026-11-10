// Thin promise-wrapped IndexedDB adapter behind the project FS seam.
// One DB, one store, key = project id. v0.1 keeps it deliberately small.
import type { Project } from '../types'

export interface ProjectStore {
  list(): Promise<{ id: string; name: string; updatedAt: number }[]>
  get(id: string): Promise<Project | undefined>
  put(p: Project): Promise<void>
  delete(id: string): Promise<void>
}

const DB_NAME = 'forge-projects'
const STORE = 'projects'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function idbStore(): ProjectStore {
  let dbp: Promise<IDBDatabase> | null = null
  const db = () => (dbp ??= open())
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await db()
    return new Promise<T>((resolve, reject) => {
      const t = d.transaction(STORE, mode)
      const r = fn(t.objectStore(STORE))
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
  }
  return {
    list: async () => {
      const all = (await tx('readonly', s => s.getAll())) as Project[]
      return all.map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    },
    get: id => tx('readonly', s => s.get(id) as unknown as IDBRequest<Project | undefined>),
    put: async p => {
      p.updatedAt = Date.now()
      await tx('readwrite', s => s.put(p))
    },
    delete: async id => {
      await tx('readwrite', s => s.delete(id))
    },
  }
}

