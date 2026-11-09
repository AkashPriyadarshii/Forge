import { useEffect, useMemo, useRef, useState } from 'react'
import { actions, useStore } from './store'
import { EditorPane } from './components/EditorPane'
import { FileTree } from './components/FileTree'
import { ConsolePane, useConsoleListener } from './components/ConsolePane'
import { PreviewPane } from './components/PreviewPane'
import { runBuild, useCommands, type Command } from './components/commands'

function useAutoRun() {
  const project = useStore(s => s.project)
  const autoRun = useStore(s => s.autoRun)
  useEffect(() => {
    if (!autoRun || !project) return
    const t = setTimeout(() => void runBuild().catch(e => actions.pushConsole({ kind: 'error', text: 'Build failed: ' + String(e) })), 700)
    return () => clearTimeout(t)
  }, [project, autoRun, project?.files.map(f => f.content.length).join() + (project?.files.map(f => f.path).join() ?? '')])
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

export function App() {
  const status = useStore(s => s.status)
  const project = useStore(s => s.project)
  const tabs = useStore(s => s.tabs)
  const activePath = useStore(s => s.activePath)
  const building = useStore(s => s.building)
  const autoRun = useStore(s => s.autoRun)
  const [paletteOpen, setPaletteOpen] = useState(false)
  useConsoleListener(true)
  useAutoRun()

  // boot: shared-project in URL hash wins, else last saved project, else seed
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void (async () => {
      if (location.hash.startsWith('#p=')) {
        const { fromShareUrl } = await import('./lib/share')
        try {
          const p = await fromShareUrl(location.hash.slice(3))
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
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault() // persistence is automatic; Ctrl+S just confirms
        actions.pushConsole({ kind: 'info', text: 'Saved (auto-synced to browser storage)' })
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
        <span className="font-serif text-lg tracking-tight text-amber-400">Forge</span>
        <input
          className="bg-transparent text-sm text-neutral-300 hover:text-neutral-100 focus:text-neutral-100 outline-none px-1 w-40 focus-visible:outline focus-visible:outline-amber-400"
          value={project.name}
          onChange={e => actions.renameProject(e.target.value)}
          aria-label="Project name"
        />
        <button
          onClick={() => void runBuild()}
          disabled={building}
          className="px-3 py-1 rounded text-xs font-medium bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-50 disabled:cursor-wait"
        >
          {building ? 'Building…' : 'Run'}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
          <input type="checkbox" checked={autoRun} onChange={e => actions.setAutoRun(e.target.checked)} className="accent-amber-400" />
          auto-run
        </label>
        <div className="flex-1" />
        <button onClick={() => setPaletteOpen(true)} className="text-xs text-neutral-500 hover:text-neutral-300 mono px-2 py-1 border border-[#23282f] rounded">
          Ctrl+K
        </button>
      </header>
      <div className="flex-1 flex min-h-0">
        <aside className="w-48 border-r border-[#1c2026] bg-[#0e1114] hidden md:block">
          <FileTree />
        </aside>
        <main className="flex-1 flex min-w-0">
          <section className="flex-1 min-w-0 border-r border-[#1c2026] flex flex-col">
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
          <section className="flex-1 min-w-0 grid grid-rows-[1fr_auto]">
            <div className="min-h-0"><PreviewPane /></div>
            <div className="h-48 border-t border-[#1c2026]"><ConsolePane /></div>
          </section>
        </main>
      </div>
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
