import { useEffect, useMemo, useRef, useState } from 'react'
import { actions, useStore, getState } from './store'
import { EditorPane } from './components/EditorPane'
import { FileTree } from './components/FileTree'
import { ConsolePane, useConsoleListener } from './components/ConsolePane'
import { PreviewPane } from './components/PreviewPane'
import { runBuild, useCommands, type Command } from './components/commands'

// persisted layout: sidebar width / editor share / console height
const LAYOUT_KEY = 'forge:layout'
function loadLayout() {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') } catch { return {} }
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function Resizer({ orientation, size, onDrag }: { orientation: 'vertical' | 'horizontal'; size: number; onDrag: (e: React.PointerEvent) => void }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-valuenow={size}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onDrag(e) }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) onDrag(e) }}
      className={orientation === 'vertical' ? 'w-1 cursor-col-resize bg-[#1c2026] hover:bg-amber-400/50 transition-colors shrink-0 touch-none' : 'h-1 cursor-row-resize bg-[#1c2026] hover:bg-amber-400/50 transition-colors touch-none'}
    />
  )
}

function useAutoRun() {
  const project = useStore(s => s.project)
  const autoRun = useStore(s => s.autoRun)
  useEffect(() => {
    if (!autoRun || !project) return
    const t = setTimeout(() => void runBuild().catch(e => actions.pushConsole({ kind: 'error', text: 'Build failed: ' + String(e) })), 700)
    return () => clearTimeout(t)
  // dep key must reflect actual content — length-based keys miss same-size edits
  }, [project, autoRun, project?.files.map(f => f.path + '\u0000' + f.content).join('\u0001') ?? ''])
}

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cmds = useCommands()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (open) { setQ(''); setIdx(0); requestAnimationFrame(() => input.current?.focus()) }
  }, [open])
  const filtered = useMemo(
    () => cmds.filter(c => (c.label + ' ' + c.id).toLowerCase().includes(q.toLowerCase())),
    [cmds, q],
  )
  if (!open) return null
  const commit = (c?: Command) => { if (c) { onClose(); c.run() } }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[10vh]" onMouseDown={onClose}>
      <div
        className="w-[min(560px,92vw)] bg-[#101317] border border-[#23282f] rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          ref={input}
          value={q}
          placeholder="Type a command or file name…"
          className="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-[#23282f] placeholder:text-neutral-600"
          onChange={e => { setQ(e.target.value); setIdx(0) }}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
            if (e.key === 'Enter') { e.preventDefault(); commit(filtered[idx]) }
          }}
          role="combobox"
          aria-expanded
          aria-controls="forge-palette-list"
        />
        <ul id="forge-palette-list" className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 && <li className="px-4 py-2 text-neutral-600 text-sm">No matches</li>}
          {filtered.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === idx}
              className={'px-4 py-2 text-sm cursor-pointer flex justify-between ' + (i === idx ? 'bg-[#1a1f26] text-amber-300' : 'text-neutral-300 hover:bg-[#16191d]')}
              onMouseEnter={() => setIdx(i)}
              onClick={() => commit(c)}
            >
              <span>{c.label}</span>
              {c.hint && <span className="text-neutral-600 mono text-xs">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function useNarrow() {
  // responsive gate reads the window, not the platform: split-screen/rotated
  // phones and resized desktop windows all move this value
  const mq = window.matchMedia('(max-width: 767px)')
  const [narrow, setNarrow] = useState(mq.matches)
  useEffect(() => {
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [mq])
  return narrow
}

export function App() {
  const status = useStore(s => s.status)
  const project = useStore(s => s.project)
  const tabs = useStore(s => s.tabs)
  const activePath = useStore(s => s.activePath)
  const building = useStore(s => s.building)
  const autoRun = useStore(s => s.autoRun)
  const narrow = useNarrow()
  const [pane, setPane] = useState<'code' | 'preview' | 'console'>('code')
  const [drawer, setDrawer] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [help, setHelp] = useState(false)

  // Preview-pane error-line clicks switch mobile focus to the code pane.
  useEffect(() => {
    if (!narrow) return
    const onJump = () => setPane('code')
    window.addEventListener('forge:jump', onJump)
    return () => window.removeEventListener('forge:jump', onJump)
  }, [narrow])
  const lay0 = useRef(loadLayout()).current
  const [sidebarW, setSidebarW] = useState<number>(lay0.sidebarW ?? 176)
  const [editorFrac, setEditorFrac] = useState<number>(lay0.editorFrac ?? 0.5)
  const [consoleH, setConsoleH] = useState<number>(lay0.consoleH ?? 176)
  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ sidebarW, editorFrac, consoleH }))
  }, [sidebarW, editorFrac, consoleH])
  useConsoleListener(true)
  useAutoRun()

  // boot: shared-project in URL hash wins, else last saved project, else seed
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void (async () => {
      if (location.hash.startsWith('#p=')) {
        const { fromShareHash } = await import('./lib/share')
        try {
          const p = await fromShareHash(location.hash.slice(3))
          history.replaceState(null, '', location.pathname)
          actions.openProject(p)
          actions.pushConsole({ kind: 'info', text: `Loaded shared project "${p.name}"` })
          void runBuild()
          return
        } catch (err) {
          actions.pushConsole({ kind: 'error', text: 'Share link invalid: ' + String(err) })
        }
      }
      const saved = await actions.init()
      if (saved) void runBuild()
    })()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void runBuild().catch(err => actions.pushConsole({ kind: 'error', text: 'Build failed: ' + String(err) }))
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setHelp(true)
      } else if (e.key === '?' && e.target === document.body) {
        setHelp(true)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault() // persistence is debounced (1s after last keystroke)
        if (getState().status === 'loading') return
        actions.pushConsole({ kind: 'info', text: 'Auto-save: changes persist to browser storage ~1s after your last keystroke' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (status === 'loading') {
    return <div className="h-full grid place-items-center text-neutral-500">Loading Forge…</div>
  }
  if (!project) {
    return (
      <div className="h-full grid place-items-center">
        <div className="text-center space-y-3">
          <div className="text-2xl font-serif tracking-tight">Forge</div>
          <p className="text-neutral-500 max-w-sm">No project open. Create one to start — everything runs and persists in your browser.</p>
          <button className="px-4 py-2 rounded bg-amber-400 text-black text-sm font-medium hover:bg-amber-300" onClick={() => actions.newProject()}>
            New project
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 px-3 py-1.5 border-b border-[#1c2026] bg-[#0e1114] select-none">
        {narrow && (
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open files"
            className="p-2 -ml-1 text-neutral-400 hover:text-neutral-200 focus-visible:outline focus-visible:outline-amber-400"
          >
            ☰
          </button>
        )}
        <span className="font-serif text-lg tracking-tight text-amber-400">Forge</span>
        <input
          className="bg-transparent text-sm text-neutral-300 hover:text-neutral-100 focus:text-neutral-100 outline-none px-1 w-40 focus-visible:outline focus-visible:outline-amber-400"
          value={project.name}
          onChange={e => actions.renameProject(e.target.value)}
          aria-label="Project name"
        />
        <ProjectsMenu />
        <SavedFlash />
        <BuildChip building={building} />
        <button
          onClick={() => void runBuild()}
          disabled={building}
          className="px-3 py-1 rounded text-xs font-medium bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-50 disabled:cursor-wait"
        >
          {building ? 'Building…' : 'Run'}
        </button>
        <label className="hidden md:flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
          <input type="checkbox" checked={autoRun} onChange={e => actions.setAutoRun(e.target.checked)} className="accent-amber-400" />
          auto-run
        </label>
        <div className="flex-1" />
        <button onClick={() => setPaletteOpen(true)} aria-label="Command menu" className="text-xs text-neutral-500 hover:text-neutral-300 mono px-2 py-1 border border-[#23282f] rounded">
          {narrow ? 'Menu' : 'Ctrl+K'}
        </button>
        <button onClick={() => setHelp(true)} aria-label="Keyboard shortcuts" title="Shortcuts (?)" className="p-2 -mr-1 text-neutral-600 hover:text-neutral-300 hidden md:block focus-visible:outline focus-visible:outline-amber-400">?</button>
      </header>
      <div className="flex-1 flex min-h-0">
        {narrow ? (
          <MobilePanes pane={pane} setPane={setPane} />
        ) : (<>
        <aside className="border-r border-[#1c2026] bg-[#0e1114] hidden md:flex flex-col shrink-0 overflow-hidden" style={{ width: clamp(sidebarW, 140, 360) }}>
          <FileTree />
        </aside>
        <Resizer orientation='vertical' size={sidebarW} onDrag={e => setSidebarW(clamp(sidebarW + e.movementX, 140, 360))} />
        <main className="flex-1 flex min-w-0">
          <section className="min-w-0 border-r border-[#1c2026] flex flex-col" style={{ flexBasis: `${clamp(editorFrac, 0.25, 0.8) * 100}%` }}>
            <div className="flex items-center border-b border-[#1c2026] bg-[#0e1114] overflow-x-auto">
              {tabs.map(t => (
                <div
                  key={t}
                  className={'flex items-center gap-2 px-3 py-1.5 text-xs border-r border-[#1c2026] cursor-pointer whitespace-nowrap ' + (t === activePath ? 'bg-[#0b0d10] text-amber-300' : 'text-neutral-400 hover:text-neutral-200')}
                  onClick={() => actions.setActive(t)}
                >
                  <span className="mono">{t}</span>
                  <button
                    aria-label={'Close ' + t}
                    className="text-neutral-600 hover:text-neutral-300"
                    onClick={e => { e.stopPropagation(); actions.closeTab(t) }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              <EditorPane />
            </div>
          </section>
          <Resizer orientation='vertical' size={Math.round(editorFrac * 100)} onDrag={e => {
            // React nulls synthetic event.currentTarget after dispatch; capture width now
            const w = e.currentTarget.parentElement!.clientWidth
            const dx = e.movementX
            setEditorFrac(f => clamp(f + dx / w, 0.25, 0.8))
          }} />
          <section className="flex-1 min-w-0 grid" style={{ gridTemplateRows: '1fr auto' }}>
            <div className="min-h-0"><PreviewPane /></div>
            <Resizer orientation='horizontal' size={consoleH} onDrag={e => setConsoleH(h => clamp(h - e.movementY, 100, 420))} />
            <div className="border-t border-[#1c2026]" style={{ height: clamp(consoleH, 100, 420) }}>
              <ConsolePane />
            </div>
          </section>
        </main>
        </>
        )}
      </div>
      {narrow && <FilesDrawer open={drawer} onClose={() => setDrawer(false)} />}
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsModal open={help} onClose={() => setHelp(false)} />
    </div>
  )
}

function ProjectsMenu() {
  const current = useStore(s => s.project?.id)
  const [others, setOthers] = useState<{ id: string; name: string; updatedAt: number }[] | null>(null)
  useEffect(() => {
    let on = true
    import('./lib/idb').then(m => m.idbStore().list()).then(list => { if (on) setOthers(list) }).catch(() => { if (on) setOthers([]) })
    return () => { on = false }
  }, [current])
  const candidates = (others ?? []).filter(p => p.id !== current)
  if (candidates.length === 0) return null
  return (
    <select
      aria-label="Switch to saved project"
      value=""
      onChange={e => {
        const id = e.target.value
        if (!id) return
        e.target.value = ''
        import('./lib/idb').then(m => m.idbStore().get(id)).then(p => { if (p) actions.openProject(p) })
      }}
      className="text-xs text-neutral-500 hover:text-neutral-300 bg-transparent border border-[#23282f] rounded px-2 py-1 focus-visible:outline focus-visible:outline-amber-400 max-w-28 truncate"
    >
      <option value="" disabled hidden>Projects…</option>
      {candidates.map(p => (
        <option key={p.id} value={p.id}>{p.name} — {new Date(p.updatedAt).toLocaleDateString()}</option>
      ))}
    </select>
  )
}

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onClose])
  if (!open) return null
  const rows: [string, string][] = [
    ['Ctrl / ⌘ + K', 'Command palette'],
    ['Ctrl / ⌘ + Enter', 'Run project'],
    ['Ctrl / ⌘ + F', 'Find in file'],
    ['Ctrl / ⌘ + H', 'Replace in file'],
    ['?', 'Shortcuts help'],
  ]
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center" onClick={onClose}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="bg-[#0e1114] border border-[#23282f] rounded-lg p-5 w-80 max-w-[90vw] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="font-serif text-lg text-amber-400 mb-3">Shortcuts</div>
        <dl className="space-y-2 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="mono text-neutral-300">{k}</dt>
              <dd className="text-neutral-500 text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 text-[10px] text-neutral-600">Everything persists in your browser automatically — no save button needed.</div>
      </div>
    </div>
  )
}

function SavedFlash() {
  const savedAt = useStore(s => s.savedAt)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!savedAt) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 1500)
    return () => clearTimeout(t)
  }, [savedAt])
  if (!savedAt || !visible) return <span className="text-[10px] text-neutral-600 hidden md:inline" aria-live="polite" />
  return <span className="text-[10px] text-emerald-500/90 hidden md:inline" aria-live="polite">saved ✓</span>
}

function BuildChip({ building }: { building: boolean }) {
  const hasError = useStore(s => s.build?.diagnostics.some(d => d.severity === 'error') ?? false)
  const hasBuild = useStore(s => s.build != null)
  if (building) return <span className="text-[10px] text-amber-400/80 hidden md:inline">building…</span>
  if (hasError) return <span className="text-[10px] text-red-400/90 hidden md:inline">errors</span>
  if (hasBuild) return <span className="text-[10px] text-neutral-500 hidden md:inline">build ok</span>
  return null
}

function MobilePanes({ pane, setPane }: { pane: 'code' | 'preview' | 'console'; setPane: (p: 'code' | 'preview' | 'console') => void }) {
  const tabs = useStore(s => s.tabs)
  const activePath = useStore(s => s.activePath)
  const consoleCount = useStore(s => s.consoleLines.length)
  let body: React.ReactNode = null
  if (pane === 'code') {
    body = (
      <section className="h-full flex flex-col min-h-0">
        <div className="flex items-center border-b border-[#1c2026] bg-[#0e1114] overflow-x-auto">
          {tabs.map(t => (
            <div
              key={t}
              className={'flex items-center gap-2 px-3 py-2.5 text-xs border-r border-[#1c2026] cursor-pointer whitespace-nowrap ' + (t === activePath ? 'bg-[#0b0d10] text-amber-300' : 'text-neutral-400 hover:text-neutral-200')}
              onClick={() => actions.setActive(t)}
            >
              <span className="mono">{t}</span>
              <button
                aria-label={'Close ' + t}
                className="text-neutral-600 hover:text-neutral-300 px-1 py-1"
                onClick={e => { e.stopPropagation(); actions.closeTab(t) }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          <EditorPane />
        </div>
      </section>
    )
  } else if (pane === 'preview') {
    body = <div className="h-full min-h-0"><PreviewPane /></div>
  } else {
    body = <div className="h-full min-h-0"><ConsolePane /></div>
  }
  return (
    <main className="flex-1 flex flex-col min-w-0">
      <nav className="flex border-b border-[#1c2026] bg-[#0e1114]" role="tablist" aria-label="Panes">
        {(['code', 'preview', 'console'] as const).map(id => (
          <button
            key={id}
            role="tab"
            aria-selected={pane === id}
            onClick={() => setPane(id)}
            className={'flex-1 py-3 text-[11px] uppercase tracking-widest focus-visible:outline focus-visible:outline-amber-400 ' + (pane === id ? 'text-amber-300 border-b border-amber-400' : 'text-neutral-500')}
          >
            {id}{id === 'console' && consoleCount > 0 ? ` (${consoleCount})` : ''}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0">{body}</div>
    </main>
  )
}

function FilesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useStore(s => s.project)
  const activePath = useStore(s => s.activePath)
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose}>
      <div
        className="absolute inset-y-0 left-0 w-64 bg-[#0e1114] border-r border-[#1c2026] shadow-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Files"
      >
        {project?.files.map(f => (
          <div
            key={f.path}
            className={'flex items-center gap-1 ' + (f.path === activePath ? 'text-amber-300 bg-[#16191d]' : 'text-neutral-400')}
          >
            <button
              onClick={() => { actions.openTab(f.path); onClose() }}
              className={'flex-1 text-left px-3 py-2.5 text-xs mono focus-visible:outline focus-visible:outline-amber-400'}
            >
              {f.path}
            </button>
            <button
              aria-label={'Rename ' + f.path}
              onClick={() => {
                const next = prompt('Rename to:', f.path)
                if (!next || next === f.path || !project) return
                import('./lib/paths').then(m => {
                  if (!m.isValidPath(next)) { actions.pushConsole({ kind: 'error', text: "Invalid path: no '..', leading /, or backslash" }); return }
                  if (project.files.some(x => x.path === next)) { actions.pushConsole({ kind: 'error', text: `File already exists: ${next}` }); return }
                  actions.renameFile(f.path, next)
                })
              }}
              className="px-2 py-2.5 text-[11px] text-neutral-600 hover:text-neutral-300 focus-visible:outline focus-visible:outline-amber-400"
            >
              ✎
            </button>
            <button
              aria-label={'Delete ' + f.path}
              onClick={() => { if (confirm(`Delete ${f.path}? Cannot be undone.`)) actions.deleteFile(f.path) }}
              className="px-2 py-2.5 text-[11px] text-neutral-600 hover:text-red-400 focus-visible:outline focus-visible:outline-amber-400"
            >
              🗑
            </button>
          </div>
        ))}
        <div className="p-3 border-t border-[#1c2026]">
          <button
            onClick={() => { const p = prompt('New file (e.g. utils/helpers.ts):'); if (p) actions.addFile(p.trim()) }}
            className="w-full py-2.5 text-xs rounded border border-[#23282f] text-neutral-300 hover:text-amber-300 focus-visible:outline focus-visible:outline-amber-400"
          >
            + New file
          </button>
        </div>
      </div>
    </div>
  )
}
