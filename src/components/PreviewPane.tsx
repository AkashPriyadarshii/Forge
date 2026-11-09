import { useEffect, useRef } from 'react'
import { useStore } from '../store'

// Sandboxed preview: opaque origin iframe. User code gets scripts only — no
// same-origin, no storage, no top navigation. All data crosses via postMessage
// from inside the frame; the parent listener stays whitelisted (ConsolePane).
export function PreviewPane() {
  const html = useStore(s => s.previewHtml)
  const key = useStore(s => s.previewKey)
  const frame = useRef<HTMLIFrameElement | null>(null)

  // srcdoc is written imperatively on every rebuild key
  useEffect(() => {
    if (frame.current && html !== null) frame.current.srcdoc = html
  }, [html, key])

  const empty = html === null
  return (
    <div className="h-full relative bg-white">
      {empty && (
        <div className="absolute inset-0 grid place-items-center text-neutral-500 text-xs dark:bg-[#0b0d10] select-none">
          Preview builds when your entry (index.html + script) is ready
        </div>
      )}
      <iframe
        ref={frame}
        key={key}
        title="Forge live preview"
        className="w-full h-full border-0 bg-white"
        sandbox="allow-scripts allow-forms allow-pointer-lock"
        allow="clipboard-write"
      />
    </div>
  )
}
