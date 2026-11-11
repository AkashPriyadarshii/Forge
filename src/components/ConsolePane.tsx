import { useEffect, useRef } from 'react'
import { actions, useStore } from '../store'
import type { ConsoleMsg } from '../types'

export function ConsolePane() {
  const lines = useStore(s => s.consoleLines)
  const bottom = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [lines])
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-1 border-b border-[#1c2026] text-[10px] uppercase tracking-widest text-neutral-500 mono">
        <span>Console</span>
        <button onClick={() => actions.clearConsole()} className="hover:text-neutral-300 focus-visible:outline focus-visible:outline-amber-400 px-1">Clear</button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 mono text-[11.5px] leading-relaxed">
        {lines.length === 0 && <div className="text-neutral-600">Preview console output appears here. console.log / errors / rejections.</div>}
        {lines.map((l, i) => (
          <Line key={i} msg={l} />
        ))}
        <div ref={bottom} />
      </div>
    </div>
  )
}

function Line({ msg }: { msg: ConsoleMsg }) {
  const color =
    msg.kind === 'error' ? 'text-red-400' : msg.kind === 'warn' ? 'text-amber-400' : msg.kind === 'info' ? 'text-sky-400' : 'text-neutral-300'
  return <div className={'whitespace-pre-wrap break-words ' + color}>{msg.text}</div>
}

export function useConsoleListener(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { forge?: string; kind?: string; text?: string; event?: string }
      // trust only the active preview frame — not window.parent or any nested frame
      const frame = (window as unknown as { __forgeFrame?: HTMLIFrameElement }).__forgeFrame
      if (!frame || e.source !== frame.contentWindow) return
      if (d?.forge !== 'console') return
      const kind = (d.kind ?? 'log') as ConsoleMsg['kind']
      actions.pushConsole({ kind, text: d.text ?? '', event: d.event as ConsoleMsg['event'] })
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [isActive])
}
