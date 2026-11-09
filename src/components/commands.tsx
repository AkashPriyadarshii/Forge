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
  const cmds: Command[] = [
    { id: 'run', label: 'Run project', hint: 'Ctrl+Enter', run: () => void runBuild() },
    { id: 'toggle-auto', label: 'Toggle auto-run', hint: getState().autoRun ? 'on' : 'off', run: () => actions.setAutoRun(!getState().autoRun) },
    { id: 'clear-console', label: 'Clear console', run: () => actions.clearConsole() },
    { id: 'new-file', label: 'New file…', run: () => { const p = prompt('File path:'); if (p) actions.addFile(p.replace(/^\/+/, '')) } },
    { id: 'share', label: 'Copy share link', run: () => void share().catch(() => {}) },
    { id: 'export', label: 'Export project (.forge.json)', run: () => void import('../lib/share').then(m => { const p = getState().project; if (p) m.exportProject(p) }) },
    { id: 'import', label: 'Import project…', run: () => doImport() },
    { id: 'new-project', label: 'New project…', run: () => { if (confirm('Start a new project (current one is saved)?')) actions.newProject() } },
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
  const { generatePreviewHtml, fileBlobUrl } = await import('../lib/preview')
  const p = getState().project
  if (!p) return
  const orchestrator = ((window as unknown as Record<string, unknown>).__forgeOrchestrator ??= new BuildOrchestrator()) as InstanceType<typeof BuildOrchestrator>
  actions.setBuilding(true)
  const files = Object.fromEntries(p.files.map(f => [f.path, f.content]))
  const result = await orchestrator.build(files)
  const previousUrls = getState().blobUrls
  for (const u of Object.values(previousUrls)) if (u) URL.revokeObjectURL(u)
  let urls: { js?: string; css?: string } = {}
  const hadError = result.diagnostics.some(d => d.severity === 'error')
  if (result.js) {
    urls.js = fileBlobUrl(result.js, 'bundle.js')
    const prevHtml = generatePreviewHtml(p, result, urls)
    actions.setBuildResult(result, { js: urls.js, css: urls.css })
    actions.setStatus({ previewHtml: prevHtml, previewKey: getState().previewKey })
  } else {
    // failed build: keep the last successful preview on screen, surface diagnostics
    actions.setBuildResult(result, previousUrls)
    const current = getState()
    if (!hadError && current.previewHtml) {
      // esbuild returned nothing without errors — nothing to run yet
      if (!current.previewHtml) actions.setBuildResult({ ...result, ok: false }, previousUrls)
    }
  }
}

async function share() {
  const { toShareUrl } = await import('../lib/share')
  const p = getState().project
  if (!p) return
  const url = await toShareUrl(p)
  await navigator.clipboard.writeText(url)
  actions.pushConsole({ kind: 'info', text: 'Share link copied (' + url.length + ' chars)' })
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
