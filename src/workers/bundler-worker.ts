import { initialize, build } from 'esbuild-wasm'
import type { BuildResult, BuildDiagnostic } from '../types'
import { resolveRelative } from '../lib/paths'

// Bundler worker: all compilation happens here, main thread never blocks.
// esbuild-wasm is loaded once from a self-hosted public/wasm/esbuild.wasm (no CDN dependency).

let ready: Promise<void> | null = null
function ensure() {
  ready ??= initialize({ wasmURL: new URL('/wasm/esbuild.wasm', self.location.href).href, worker: false })
  return ready
}

function resolveExt(path: string): string {
  const m = /\.([a-z]+)$/.exec(path)
  return m ? m[1] : ''
}

/**
 * Bundle a virtual multi-file project.
 * Entry: index.html — we extract its <script src> / <link href> local references,
 * strip them, build the JS graph (and CSS), and return rewritten HTML.
 */
async function buildProject(
  filesIn: Record<string, string>,
): Promise<BuildResult> {
  await ensure()
  const files: Record<string, string> = { ...filesIn }
  const html = files['index.html'] ?? ''
  const diagnostics: BuildDiagnostic[] = []

  // Local references in HTML: <script src="x.js"> and <link rel stylesheet href="x.css">
  const scripts: string[] = []
  const links: string[] = []
  void html
    .replace(/<script(?=[^>]*\bsrc\s*=\s*["'])([^>]*)><\/script>/gi, (tag, attrs) => {
      const m = /src\s*=\s*["']([^"']+)["']/.exec(attrs)!
      const src = m[1]
      if (/^([a-z]+:|\/\/)/i.test(src) || src.startsWith('/')) return tag // CDN / absolute: leave
      scripts.push(src)
      return '' // replaced with blob module below
    })
    .replace(/<link([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>/gi, (tag, pre, href, post) => {
      if (!/rel\s*=\s*["']stylesheet["']/.test(pre + post)) return tag
      if (/^([a-z]+:|\/\/)/i.test(href) || href.startsWith('/')) return tag
      links.push(href)
      return ''
    })

  let js = null as string | null
  let css = null as string | null
  try {
    if (scripts.length) {
      const result = await build({
        entryPoints: scripts,
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        outdir: '/out',
        sourcemap: false,
        logLevel: 'silent',
        loader: { '.html': 'text' },
        resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.css', '.json', '.mjs', '.cjs'],
        plugins: [
          {
            name: 'forge-vfs',
            setup(b) {
              b.onResolve({ filter: /.*/ }, args => {
                if (args.namespace === 'forge-css') return { path: args.path, namespace: 'forge-css' }
                if (args.kind === 'entry-point') return { path: args.path, namespace: 'entry-file' }
                const base = args.path.startsWith('.') ? null : args.path
                if (base && !args.path.startsWith('/')) {
                  // bare specifier: npm import — resolve against esm.sh CDN (outside worker's fs)
                  const sub = args.importer
                  if (files[resolveRelative(sub, args.path)]) return { path: resolveRelative(sub, args.path) }
                  return { path: args.path, external: true }
                }
                const resolved = resolveRelative(args.importer || args.path, args.path)
                return { path: resolved }
              })
              b.onLoad({ filter: /./ }, args => {
                const ns = args.namespace
                let path = args.path
                if (ns === 'entry-file') path = path.replace(/^\//, '')
                if (ns === 'forge-css') path = path.replace(/^\/out\//, '')
                let content = files[path]
                if (content === undefined && (ns === 'entry-file' || ns === 'forge-css')) content = files[path]
                if (content === undefined) return undefined
                const ext = resolveExt(path)
                if (ext === 'css') return { contents: content, loader: 'css' }
                if (ext === 'json') return { contents: content, loader: 'json' }
                if (ext === 'html') return { contents: content, loader: 'text' }
                return { contents: content, loader: ext === 'ts' ? 'ts' : ext === 'tsx' ? 'tsx' : ext === 'jsx' ? 'jsx' : 'js' }
              })
            },
          },
        ],
      })

      for (const e of result.errors) {
        if (e.location) {
          diagnostics.push({
            path: e.location.file?.replace(/^\//, '') ?? '',
            line: e.location.line, column: e.location.column,
            text: e.text, severity: 'error',
          })
        }
        console.error('[forge-build]', e.text)
      }
      js = result.outputFiles?.find(f => f.path.endsWith('.js'))?.text ?? null
      const cssOut = result.outputFiles?.find(f => f.path.endsWith('.css'))
      css = cssOut ? cssOut.text : collectImportedCss(result.outputFiles)
      // Note: css imported from js ends up inside js without plugin css processing; acceptable v0.1
      // — css files referenced directly by entry scripts get bundled when esbuild treats .css import.
    }
  } catch {
    // build() throws on config errors; diagnostics above carry user-facing errors
    js = null
  }
  if (links.length) {
    const cssTexts = links.map(l => files[l] ?? '')
    css = css === null ? cssTexts.join('\n') : css + '\n' + cssTexts.join('\n')
    for (const l of links) if (files[l] === undefined) {
      diagnostics.push({ path: l, line: 1, column: 1, text: `File not found: ${l}`, severity: 'error' })
    }
  }
  for (const s of scripts) if (files[s] === undefined) {
    diagnostics.push({ path: s, line: 1, column: 1, text: `Entry script not found: ${s}`, severity: 'error' })
  }
  return { ok: diagnostics.filter(d => d.severity === 'error').length === 0 && js !== null, js, css, diagnostics }
}

// esbuild bundles @import'ed css into a separate .css output file.
function collectImportedCss(outputFiles: { path: string; text: string }[] | undefined): string | null {
  const all = outputFiles?.filter(f => f.path.endsWith('.css')).map(f => f.text).join('\n')
  return all || null
}

self.onmessage = async (e: MessageEvent) => {
  const { id, files } = e.data as { id: number; files: Record<string, string> }
  const result = await buildProject(files)
    .catch(err => ({ ok: false, js: null, css: null, diagnostics: [{ path: '', line: 0, column: 0, text: String(err), severity: 'error' as const }] }))
  ;(self as unknown as Worker).postMessage({ id, result })
}
