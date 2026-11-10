import { useEffect, useMemo, useRef, useState } from 'react'
import { actions, useStore } from '../store'
import type { BuildDiagnostic } from '../types'

const DEVICES = [
  { id: 'auto', label: 'Auto', width: null },
  { id: 'phone', label: 'Phone', width: 390 },
  { id: 'tablet', label: 'Tablet', width: 768 },
] as const

// Sandboxed preview: opaque origin iframe. User code gets scripts only — no
// same-origin, no storage, no top navigation. All data crosses via postMessage
// from inside the frame; the parent listener stays whitelisted (ConsolePane).
export function PreviewPane() {
  const html = useStore(s => s.previewHtml)
  const key = useStore(s => s.previewKey)
  const build = useStore(s => s.build)
  const errors = useMemo(() => build?.diagnostics.filter(d => d.severity === 'error') ?? null, [build])
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('auto')
  const [showErrors, setShowErrors] = useState(true)

  // srcdoc is written imperatively on every rebuild key
  useEffect(() => {
    if (frame.current && html !== null) frame.current.srcdoc = html
  }, [html, key])

  // console bridge whitelist: the listener trusts only THIS frame's messages
  useEffect(() => {
    (window as unknown as { __forgeFrame: unknown }).__forgeFrame = frame.current
    return () => { delete (window as unknown as { __forgeFrame?: unknown }).__forgeFrame }
  }, [])

  useEffect(() => {
    if (errors?.length) setShowErrors(true)
  }, [errors?.length])

  const width = DEVICES.find(d => d.id === device)?.width
  const empty = html === null
  return (
    <div className="h-full relative bg-white flex flex-col">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[#1c2026] bg-[#0e1114] select-none shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500 mono px-1">Preview</span>
        <button
          onClick={() => { if (frame.current && html !== null) frame.current.srcdoc = html }}
          aria-label="Reload preview"
          title="Reload preview"
          className="px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-200 focus-visible:outline focus-visible:outline-amber-400"
        >
          ↻
        </button>
        <div className="flex-1" />
        <div role="radiogroup" aria-label="Preview width" className="flex items-center gap-0.5">
          {DEVICES.map(d => (
            <button
              key={d.id}
              role="radio"
              aria-checked={device === d.id}
              onClick={() => setDevice(d.id)}
              className={'px-2 py-1.5 text-[10px] rounded focus-visible:outline focus-visible:outline-amber-400 ' + (device === d.id ? 'text-amber-300 bg-[#16191d]' : 'text-neutral-500 hover:text-neutral-300')}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {errors && errors.length > 0 && showErrors && (
        <div className="shrink-0 border-b border-red-900/40 bg-red-950/30 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-red-400 font-medium">Build failed — {errors.length} error{errors.length > 1 ? 's' : ''}</span>
            <button onClick={() => setShowErrors(false)} aria-label="Dismiss errors" className="text-red-500/70 hover:text-red-300 px-1">×</button>
          </div>
          <ul className="mt-1 space-y-0.5">
            {errors.slice(0, 3).map((d, i) => (
              <li key={i}>
                <ErrorLine d={d} />
              </li>
            ))}
          </ul>
          {errors.length > 3 && <div className="text-red-400/60 mt-0.5">+{errors.length - 3} more in Console</div>}
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        <div style={{ width: width ?? '100%', maxWidth: '100%', margin: width ? '0 auto' : undefined, height: '100%' }}>
          <iframe
            ref={frame}
            key={key}
            title="Forge live preview"
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-pointer-lock"
          />
        </div>
        {empty && (
          <div className="absolute inset-0 grid place-items-center text-neutral-500 text-xs dark:bg-[#0b0d10] select-none pointer-events-none">
            Preview builds when your entry (index.html + script) is ready
          </div>
        )}
      </div>
    </div>
  )
}

function ErrorLine({ d }: { d: BuildDiagnostic }) {
  return (
    <button
      onClick={() => {
        if (d.path) {
          actions.jumpTo(d.path, d.line ?? 1, d.column ?? 1)
          window.dispatchEvent(new CustomEvent('forge:jump'))
        }
      }}
      className="w-full text-left text-red-300 hover:text-red-100 focus-visible:outline focus-visible:outline-amber-400"
    >
      {d.path || '<build>'}:{d.line ?? 1}:{d.column ?? 1} — {d.text}
    </button>
  )
}
