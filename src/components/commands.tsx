import { useStore, actions, getState } from '../store'

// Command palette: Ctrl+K, fuzzy-lite filter over a flat action list.
export interface Command {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function useCommands(): Command[] {
  const project = useStore(s => s.project)
  const autoRun = useStore(s => s.autoRun)
  const cmds: Command[] = [
    { id: 'run', label: 'Run project', hint: 'Ctrl+Enter', run: () => void runBuild() },
    { id: 'toggle-auto', label: 'Toggle auto-run', hint: autoRun ? 'currently on' : 'currently off', run: () => actions.setAutoRun(!autoRun) },
    { id: 'clear-console', label: 'Clear console', run: () => actions.clearConsole() },
    { id: 'new-file', label: 'New file…', run: () => newFile() },
    { id: 'rename-file', label: 'Rename current file…', run: () => renameFile() },
    { id: 'share', label: 'Copy share link', run: () => void share().catch(() => {}) },
    { id: 'export', label: 'Export project (.forge.json)', run: () => void import('../lib/share').then(m => { const p = getState().project; if (p) m.exportProject(p) }) },
    { id: 'import', label: 'Import project…', run: () => doImport() },
    { id: 'new-project', label: 'New project…', run: () => { if (confirm('Start a new project (current one is saved)?')) actions.newProject() } },
    { id: 'switch-project', label: 'Switch project…', run: () => void switchProject() },
    { id: 'format', label: 'Format current file', hint: 'Prettier', run: () => void formatFile() },
  ]
  if (project) {
    for (const f of project.files) {
      cmds.push({ id: 'open:' + f.path, label: 'Open ' + f.path, run: () => actions.openTab(f.path) })
    }
  }
  return cmds
}

export async function runBuild() {
  const { BuildOrchestrator } = await import('../lib/bundler')
  const { generatePreviewHtml } = await import('../lib/preview')
  const p = getState().project
  if (!p) return
  const orchestrator = ((window as unknown as Record<string, unknown>).__forgeOrchestrator ??= new BuildOrchestrator()) as InstanceType<typeof BuildOrchestrator>
  actions.setBuilding(true)
  const files = Object.fromEntries(p.files.map(f => [f.path, f.content]))
  const result = await orchestrator.build(files)
  if (result.js && result.html) {
    const prevHtml = generatePreviewHtml(p, result)
    actions.setBuildResult(result)
    actions.setStatus({ previewHtml: prevHtml, previewKey: getState().previewKey })
  } else {
    // failed build: keep the last successful preview on screen, surface diagnostics
    actions.setBuildResult(result)
    for (const d of result.diagnostics.filter(x => x.severity === 'error').slice(0, 10)) {
      actions.pushConsole({ kind: 'error', text: `${d.path || '<build>'}:${d.line}:${d.column} ${d.text}` })
    }
    if (result.diagnostics.length === 0) actions.pushConsole({ kind: 'error', text: 'Build produced no JavaScript output' })
  }
}

async function formatFile() {
  const { formatCode } = await import('../lib/format')
  const path = getState().activePath
  if (!path) return
  const content = getState().project?.files.find(f => f.path === path)?.content
  if (content === undefined) return
  const formatted = await formatCode(path, content)
  if (formatted === null) actions.pushConsole({ kind: 'warn', text: `No formatter for ${path}` })
  else if (formatted !== content) actions.editFile(path, formatted)
}

async function share() {
  const { toShareUrl } = await import('../lib/share')
  const p = getState().project
  if (!p) return
  const url = await toShareUrl(p)
  await navigator.clipboard.writeText(url)
  actions.pushConsole({ kind: 'info', text: 'Share link copied (' + url.length + ' chars)' })
}

function renameFile() {
  const p = getState().project
  const active = getState().activePath
  if (!p || !active) { actions.pushConsole({ kind: 'info', text: 'Open a file first' }); return }
  const next = prompt('Rename to:', active)
  if (!next || next === active) return
  import('../lib/paths').then(m => {
    if (!m.isValidPath(next)) {
      actions.pushConsole({ kind: 'error', text: "Invalid path: no '..', leading /, or backslash" })
      return
    }
    if (p.files.some(f => f.path === next)) { actions.pushConsole({ kind: 'error', text: `File already exists: ${next}` }); return }
    actions.renameFile(active, next)
  })
}

function switchProject() {
  // replaced by the header Projects selector (ProjectsMenu) — see App.tsx
  const p = getState().project
  actions.pushConsole({ kind: 'info', text: p ? 'Use the Projects menu (next to the project name)' : 'No project open' })
}

function newFile() {
  const p = prompt('New file (e.g. utils/helpers.ts):')
  if (!p) return
  void import('../lib/paths').then(m => {
    if (!m.isValidPath(p)) {
      actions.pushConsole({ kind: 'error', text: "Invalid path: no '..', leading /, or backslash" })
      return
    }
    if (!actions.addFile(p)) actions.pushConsole({ kind: 'error', text: `File already exists: ${p}` })
  })
}

function doImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.forge.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    import('../lib/share').then(m => m.importProjectFile(file)).then(
      p => { actions.openProject(p); actions.pushConsole({ kind: 'info', text: `Imported "${p.name}" (${p.files.length} files)` }) },
      err => actions.pushConsole({ kind: 'error', text: 'Import failed: ' + String(err) }),
    )
  }
  input.click()
}
