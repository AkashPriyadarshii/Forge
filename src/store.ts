import { useSyncExternalStore } from 'react'
import type { Project, BuildResult, ConsoleMsg, BuildDiagnostic } from './types'
import { isValidPath } from './lib/paths'

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
  previewHtml: string | null
  previewKey: number
  /** timestamp of last persisted save (drives the “Saved ✓” header flash) */
  savedAt: number | null
  /** request to open a file at a line (build error click) — n bumps each request */
  jump: { path: string; line: number; column: number; n: number } | null
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
  previewHtml: null,
  previewKey: 0,
  savedAt: null,
  jump: null,
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
  addFile(path: string): boolean {
    const p = state.project
    if (!p || p.files.some(f => f.path === path)) return false
    const files = [...p.files, { path, content: '' }].sort((a, b) => a.path.localeCompare(b.path))
    set({ project: { ...p, files } })
    actions.openTab(path)
    persistSoon()
    return true
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
  renameFile(old: string, next: string) {
    if (old === next) return
    const p = state.project
    if (!p || !isValidPath(next) || p.files.some(f => f.path === next)) return
    const project = { ...p, updatedAt: Date.now(), files: p.files.map(f => (f.path === old ? { path: next, content: f.content } : f)) }
    set({
      project,
      activePath: state.activePath === old ? next : state.activePath,
      tabs: state.tabs.map(t => (t === old ? next : t)),
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
    set({ project: seed, tabs: ['index.html'], activePath: 'index.html', build: null, diagnostics: [], consoleLines: [], previewHtml: null, previewKey: state.previewKey + 1 })
    persistSoon()
  },
  openProject(p: Project) {
    set({ project: p, tabs: p.files.some(f => f.path === 'index.html') ? ['index.html'] : p.files.slice(0, 1).map(f => f.path), activePath: p.files[0]?.path ?? null, build: null, diagnostics: [], consoleLines: [], previewHtml: null, previewKey: state.previewKey + 1 })
    persistSoon()
  },
  pushConsole(msg: ConsoleMsg) {
    set({ consoleLines: [...state.consoleLines.slice(-200), msg] })
  },
  jumpTo(path: string, line: number, column = 1) {
    actions.openTab(path)
    set({ jump: { path, line, column, n: (state.jump?.n ?? 0) + 1 } })
  },
  clearConsole() { set({ consoleLines: [] }) },
  setBuilding(b: boolean) { set({ building: b }) },
  setBuildResult(result: BuildResult) {
    set({
      build: result,
      diagnostics: result.diagnostics,
      previewKey: state.previewKey + 1,
      building: false,
    })
  },
  setAutoRun(b: boolean) { set({ autoRun: b }) },
  // Boot: restore most-recent project from IndexedDB (undefined if none).
  async init(): Promise<Project | undefined> {
    const seedOrOpen = (p: Project) => {
      set({ project: p, tabs: p.files.map(f => f.path), activePath: p.files[0]?.path ?? null, status: 'ready' })
      void navigator.storage?.persist?.().catch(() => {})
      return p
    }
    try {
      const all = await projectStore.list()
      const latest = all.sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (!latest) return seedOrOpen(defaultProject('untitled')) // first visit: seed the hello project
      const p = await projectStore.get(latest.id)
      return p ? seedOrOpen(p) : seedOrOpen(defaultProject('untitled'))
    } catch (err) {
      console.warn('Forge: storage unavailable, starting fresh', err)
      return seedOrOpen(defaultProject('untitled'))
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
    if (p) void persist(p).then(() => set({ savedAt: Date.now() }))
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
