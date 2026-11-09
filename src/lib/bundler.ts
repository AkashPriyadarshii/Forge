import type { BuildResult } from '../types'

// Single-flight build orchestrator, latest-wins: one build in flight; later
// snapshots coalesce into the next build; all coalesced callers resolve with
// the build of the freshest snapshot. Stale results are never delivered.
export class BuildOrchestrator {
  private worker: Worker
  private busy = false
  private nextFiles: Record<string, string> | null = null
  private waiters: ((r: BuildResult) => void)[] = []

  constructor() {
    this.worker = new Worker(new URL('../workers/bundler-worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<{ result: BuildResult }>) => {
      this.busy = false
      const deliver = this.waiters
      this.waiters = []
      if (this.nextFiles) {
        const files = this.nextFiles
        this.nextFiles = null
        void this.run(files)
        return
      }
      for (const d of deliver) d(e.data.result)
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
    this.worker.postMessage({ files })
  }
}
