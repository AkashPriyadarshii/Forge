import type { BuildResult } from '../types'

// Single-flight build orchestrator, latest-wins: one build in flight; later
// snapshots coalesce into the next build; all coalesced callers resolve with
// the build of the freshest snapshot. Stale results are never delivered.
export class BuildOrchestrator {
  private worker: Worker
  private busy = false
  private wasmUrl: string
  private nextFiles: Record<string, string> | null = null
  private waiters: ((r: BuildResult) => void)[] = []

  constructor() {
    this.worker = new Worker(new URL('../workers/bundler-worker.ts', import.meta.url), { type: 'module' })
    // esbuild-wasm is served from <base>/wasm/ (dev root, prod dist); BASE_URL keeps dev/prod correct
    this.wasmUrl = new URL('wasm/esbuild.wasm', location.origin + import.meta.env.BASE_URL).href
    this.worker.onerror = e => { console.error('[forge] worker error:', e.message || e); this.busy = false; for (const d of this.waiters.splice(0)) d({ ok: false, js: null, css: null, html: null, diagnostics: [{ path: '', line: 0, column: 0, text: 'worker crashed: ' + (e.message || 'unknown'), severity: 'error' }] }) }
    this.worker.onmessage = (e: MessageEvent<{ result: BuildResult }>) => {
      this.busy = false
      // deliver the current result to waiters BEFORE starting the queued build
      for (const d of this.waiters.splice(0)) d(e.data.result)
      if (this.nextFiles) {
        const files = this.nextFiles
        this.nextFiles = null
        void this.run(files)
      }
    }
  }

  build(files: Record<string, string>): Promise<BuildResult> {
    if (this.busy) {
      this.nextFiles = files
    } else {
      void this.run(files)
    }
    return new Promise(r => this.waiters.push(r))
  }

  private run(files: Record<string, string>) {
    this.busy = true
    // wasmUrl rides with every build: the init-only message is ignored by the worker
    this.worker.postMessage({ files, wasmUrl: this.wasmUrl })
  }
}
