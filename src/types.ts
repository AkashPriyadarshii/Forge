// Domain model — versioned, the snapshot schema depends on these versions.
export const PROJECT_FORMAT = 1

export interface ProjectFile {
  path: string // e.g. "src/main.tsx" — forward slashes always, no leading slash
  content: string
}

export interface Project {
  format: number
  id: string
  name: string
  createdAt: number
  updatedAt: number
  files: ProjectFile[]
}

export interface BuildDiagnostic {
  path: string
  line: number
  column: number
  text: string
  severity: 'error' | 'warning'
}

export interface BuildResult {
  ok: boolean
  js: string | null // bundled main module
  css: string | null // bundled css
  html: string | null // entry HTML with local script/link references stripped
  diagnostics: BuildDiagnostic[]
}

export interface ConsoleMsg {
  kind: 'log' | 'info' | 'warn' | 'error'
  text: string
  event?: 'uncaught' | 'unhandledrejection'
}

export const ENTRY = 'index.html'
export const CODE_EXTENSIONS: Record<string, string> = {
  js: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx', css: 'css', html: 'html', json: 'json', mjs: 'js', cjs: 'js',
}
