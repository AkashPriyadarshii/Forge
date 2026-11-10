import { useStore, actions } from '../store'

const iconFor = (path: string) => {
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) return 'TS'
  if (/\.css$/.test(path)) return 'CS'
  if (/\.(html?)$/.test(path)) return 'HT'
  return '·'
}

export function FileTree() {
  const project = useStore(s => s.project)
  const tabs = useStore(s => s.tabs)
  if (!project) return null
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-widest text-neutral-500 mono">Files</div>
      <ul>
        {project.files.map(f => {
          const open = tabs.includes(f.path)
          return (
            <li key={f.path}>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[#16191d] focus-visible:outline focus-visible:outline-amber-400"
                onClick={() => actions.openTab(f.path)}
                title={f.path}
              >
                <span className={'text-[9px] font-bold w-5 mono ' + (open ? 'text-amber-400' : 'text-neutral-600')}>{iconFor(f.path)}</span>
                <span className={'truncate ' + (open ? 'text-neutral-200' : 'text-neutral-400')}>{f.path}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
