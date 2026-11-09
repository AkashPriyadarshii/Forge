import type { BuildResult, Project } from '../types'

// Preview document generation: user HTML + bundled blobs + console shim +
// import map for bare npm imports (resolved against esm.sh — the only network
// dependency Forge itself has; see docs/ARCHITECTURE.md).

const CONSOLE_SHIM = `<script>
(function () {
  var send = function (msg) { try { parent.postMessage(msg, '*') } catch (e) {} };
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var original = console[level].bind(console)
    console[level] = function () {
      var parts = []
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i]
        try {
          parts.push(typeof a === 'string' ? a : JSON.stringify(a, function (k, v) { return v instanceof Error ? String(v) : v }))
        } catch (e) { parts.push(String(a)) }
      }
      send({ forge: 'console', kind: level, text: parts.join(' ') })
      original.apply(console, arguments)
    }
  })
  window.addEventListener('error', function (e) {
    send({ forge: 'console', kind: 'error', event: 'uncaught', text: e.message + ' (' + (e.filename || '') + ':' + e.lineno + ')' })
  })
  window.addEventListener('unhandledrejection', function (e) {
    send({ forge: 'console', kind: 'error', event: 'unhandledrejection', text: 'Unhandled rejection: ' + e.reason })
  })
})()
</script>`

const MIME: Record<string, string> = {
  js: 'application/javascript', css: 'text/css', html: 'text/html', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', wasm: 'application/wasm',
}

export function fileBlobUrl(content: string, path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase()
  return URL.createObjectURL(new Blob([content], { type: MIME[ext] ?? 'text/plain' }))
}

/** Bare (npm) specifiers left external by the bundler → esm.sh import map. */
function bareImports(js: string): ImportMap {
  const map: ImportMap = { imports: {} }
  const re = /(?:from|import)\s*["']([a-z@][\w@./-]*?)(?:\/[^"']*)?["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(js))) {
    const name = m[1]
    if (!name.startsWith('.') && !name.startsWith('/')) {
      map.imports[name] = `https://esm.sh/${name}/*`
      map.imports[`${name}/*`] = `https://esm.sh/${name}/*`
    }
  }
  return map
}

type ImportMap = { imports: Record<string, string> }

/**
 * Generates the sandboxed preview document. User scripts are stripped by the
 * bundler (see bundler-worker) — bundled blobs are injected after </head> so
 * the original user markup executes unmodified apart from asset URLs.
 */
export function generatePreviewHtml(project: Project, build: BuildResult, urls: { js?: string; css?: string }): string {
  const html = project.files.find(f => f.path === 'index.html')?.content ?? '<!doctype html><title>Forge preview</title>'
  const importMap: ImportMap | null = build.js
    ? bareImports(build.js)
    : null
  const importsJson = importMap && Object.keys(importMap.imports).length
    ? `<script type="importmap">${JSON.stringify(importMap)}</script>`
    : ''
  const cssTag = urls.css && urls.css.length ? `<link rel="stylesheet" href="${urls.css}">` : ''
  const jsTag = urls.js ? `<script type="module" src="${urls.js}"></script>` : ''
  const lastHead = /<\/head>/i.test(html) ? html.indexOf('</head>') : html.length
  return (
    html.slice(0, lastHead) +
    CONSOLE_SHIM +
    importsJson +
    (build.css ? `<style>${escapeCss(build.css)}</style>` : '') +
    cssTag +
    jsTag +
    html.slice(lastHead)
  )
}

function escapeCss(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style')
}
