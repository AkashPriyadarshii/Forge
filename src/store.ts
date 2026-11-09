import { useSyncExternalStore } from 'react'
import type { Project, BuildResult, ConsoleMsg, BuildDiagnostic } from './types'

export interface State {
  status: 'loading' | 'ready' | 'error'
  error?: string
  project: Project | null
  projects: { id: string; name: string; updatedAt: number }[]
  tabs: string[] // open file paths
  activePath: string | null
  build: BuildResult | null
  building: boolean
  autoRun: boolean
  consoleLines: ConsoleMsg[]
  diagnostics: BuildDiagnostic[]
  blobUrls: { js?: string; css?: string }
  previewHtml: string | null
  previewKey: number
}

let state: State = {
  status: 'loading',
  project: null,
  projects: [],
  tabs: [],
  activePath: null,
  build: null,
  building: false,
  autoRun: true,
  consoleLines: [],
  diagnostics: [],
  blobUrls: {},
  previewHtml: null,
  previewKey: 0,
}

const listeners = new Set<() => void>()
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getState = (): State => state
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state))
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

export const actions = {
  setStatus(s: Partial<State>) { set(s) },
  openTab(path: string) {
    set({
      tabs: state.tabs.includes(path) ? state.tabs : [...state.tabs, path],
      activePath: path,
    })
  },
  closeTab(path: string) {
    const tabs = state.tabs.filter(t => t !== path)
    set({ tabs, activePath: state.activePath === path ? tabs[tabs.length - 1] ?? null : state.activePath })
  },
  setActive(path: string | null) { set({ activePath: path }) },
  editFile(path: string, content: string) {
    const p = state.project
    if (!p) return
    const files = p.files.map(f => (f.path === path ? { ...f, content } : f))
    set({ project: { ...p, files } })
    persistSoon()
  },
  addFile(path: string) {
    const p = state.project
    if (!p || p.files.some(f => f.path === path)) return
    const files = [...p.files, { path, content: '' }].sort((a, b) => a.path.localeCompare(b.path))
    set({ project: { ...p, files } })
    actions.openTab(path)
    persistSoon()
  },
  deleteFile(path: string) {
    const p = state.project
    if (!p) return
    set({
      project: { ...p, files: p.files.filter(f => f.path !== path) },
      ...(() => {
        const tabs = state.tabs.filter(t => t !== path)
        return { tabs, activePath: state.activePath === path ? tabs[tabs.length - 1] ?? null : state.activePath }
      })(),
    })
    persistSoon()
  },
  renameProject(name: string) {
    if (!state.project) return
    set({ project: { ...state.project, name } })
    persistSoon()
  },
  newProject() {
    const seed = defaultProject(`project-${Math.random().toString(36).slice(2, 6)}`)
    set({ project: seed, tabs: ['index.html'], activePath: 'index.html', build: null, diagnostics: [], consoleLines: [], blobUrls: {}, previewHtml: null, previewKey: state.previewKey + 1 })
    persistSoon()
  },
  openProject(p: Project) {
    set({ project: p, tabs: p.files.some(f => f.path === 'index.html') ? ['index.html'] : p.files.slice(0, 1).map(f => f.path), activePath: p.files[0]?.path ?? null, build: null, diagnostics: [], consoleLines: [], blobUrls: {}, previewHtml: null, previewKey: state.previewKey + 1 })
    persistSoon()
  },
  pushConsole(msg: ConsoleMsg) {
    set({ consoleLines: [...state.consoleLines.slice(-200), msg] })
  },
  clearConsole() { set({ consoleLines: [] }) },
  setBuilding(b: boolean) { set({ building: b }) },
  setBuildResult(result: BuildResult, blobUrls: { js?: string; css?: string }) {
    set({
      build: result,
      diagnostics: result.diagnostics,
      blobUrls,
      previewKey: state.previewKey + 1,
      building: false,
    })
  },
  setAutoRun(b: boolean) { set({ autoRun: b }) },
  // Boot: restore most-recent project from IndexedDB (undefined if none).
  async init(): Promise<Project | undefined> {
    try {
      const all = await projectStore.list()
      if (all.length === 0) return undefined
      const latest = all.sort((a, b) => b.updatedAt - a.updatedAt)[0]
      const p = await projectStore.get(latest.id)
      if (p) {
        set({ project: p, tabs: p.files.map(f => f.path), activePath: p.files[0]?.path ?? null })
        void navigator.storage?.persist?.().catch(() => {})
      }
      return p
    } catch (err) {
      console.warn('Forge: storage unavailable, starting fresh', err)
      return undefined
    }
  },
}

// Debounced persistence: at most one IndexedDB write per second while typing.
let persistTimer: ReturnType<typeof setTimeout> | null = null
function persistSoon() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    const p = state.project
    if (p) void persist(p)
  }, 1000)
}

import { idbStore } from './lib/idb'
import { defaultProject } from './lib/seed'
const projectStore = idbStore()
async function persist(p: Project) {
  try {
    await projectStore.put(p)
  } catch (err) {
    console.warn('Forge: could not persist project', err)
  }
}
