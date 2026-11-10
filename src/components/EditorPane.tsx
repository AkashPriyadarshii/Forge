import { useEffect, useMemo, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState, EditorSelection, type Extension } from '@codemirror/state'
import { indentWithTab, history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { javascript } from '@codemirror/lang-javascript'
import { html as htmlLang } from '@codemirror/lang-html'
import { css as cssLang } from '@codemirror/lang-css'
import { linter, lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint'
import { search, searchKeymap } from '@codemirror/search'
import { bracketMatching, indentOnInput, foldGutter, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { actions, getState, useStore } from '../store'

// Forge highlight palette — warm neutrals, Control layers, structured density.
const forgeHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#c678dd' },
  { tag: [tags.string, tags.special(tags.string)], color: '#98c379' },
  { tag: [tags.number, tags.bool], color: '#d19a66' },
  { tag: [tags.variableName, tags.propertyName], color: '#e8e6e1' },
  { tag: tags.function(tags.variableName), color: '#61afef' },
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: tags.tagName, color: '#e06c75' },
  { tag: tags.attributeName, color: '#d9a046' },
])

const langFor = (path: string): Extension => {
  if (/\.tsx?$/.test(path)) return javascript({ typescript: true, jsx: /\.tsx$/.test(path) })
  if (/\.jsx?$/.test(path)) return javascript({ jsx: /\.jsx$/.test(path) })
  if (/\.(html?)$/.test(path)) return htmlLang()
  if (/\.css$/.test(path)) return cssLang()
  return []
}

function posFromLineCol(text: string, d: { line: number; column: number }, end = false) {
  const lines = text.split('\n')
  const lineIdx = Math.min(Math.max(d.line - 1, 0), lines.length - 1)
  let offset = 0
  for (let i = 0; i < lineIdx; i++) offset += lines[i].length + 1
  const line = lines[lineIdx] ?? ''
  const pos = offset + (end ? line.length : Math.min(Math.max(d.column - 1, 0), Math.max(line.length - 1, 0)))
  return Math.min(Math.max(pos, 0), text.length)
}

// CM6 pattern (official "multiple buffers"): one live EditorView, per-file
// EditorStates swapped in on tab change so selection/history persist per tab.
export function EditorPane() {
  const activePath = useStore(s => s.activePath)
  const project = useStore(s => s.project)
  const diagnosticsVersion = useStore(s => s.build)
  const viewHost = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const states = useRef(new Map<string, EditorState>())

  const savedDoc = useMemo(() => project?.files.find(f => f.path === activePath)?.content ?? '', [project, activePath])
  const docRef = useRef(savedDoc)
  docRef.current = savedDoc

  const lintSource = useMemo(
    () =>
      linter(() => {
        const ds = activePath ? getState().diagnostics.filter(d => d.path === activePath) : []
        return ds.map(d => ({
          from: posFromLineCol(docRef.current, d),
          to: posFromLineCol(docRef.current, d, true),
          severity: d.severity,
          message: d.text,
        }))
      }),
    [activePath],
  )

  const extensions = useMemo<Extension[]>(
    () => [
      lineNumbers(),
      foldGutter(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      search({ top: true }),
      syntaxHighlighting(forgeHighlight),
      lintGutter(),
      lintSource,
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
      langFor(activePath ?? ''),
      EditorView.updateListener.of(update => {
        if (update.docChanged && activePath) actions.editFile(activePath, update.state.doc.toString())
      }),
    ],
    [activePath, lintSource],
  )

  // Swap states only on tab change (or external doc change): recreating the
  // view per keystroke would destroy focus and selection mid-edit.
  useEffect(() => {
    const host = viewHost.current
    if (!host || activePath === null) return
    const cached = states.current.get(activePath)
    const fresh = cached && cached.doc.toString() === docRef.current ? cached : EditorState.create({ doc: docRef.current, extensions })
    const view = new EditorView({ state: fresh, parent: host })
    viewRef.current = view
    return () => {
      states.current.set(activePath, view.state)
      viewRef.current = null
      view.destroy()
    }
  }, [activePath, extensions])

  // Evict cached tab states for files that no longer exist.
  useEffect(() => {
    if (!project) return
    const paths = new Set(project.files.map(f => f.path))
    for (const path of states.current.keys()) {
      if (!paths.has(path)) states.current.delete(path)
    }
  }, [project])

  // Lint markers refresh with new build results, not just doc edits.
  useEffect(() => {
    if (!viewRef.current || !activePath) return
    setDiagnostics(
      viewRef.current.state,
      getState().diagnostics
        .filter(d => d.path === activePath)
        .map(d => ({
          from: posFromLineCol(docRef.current, d),
          to: posFromLineCol(docRef.current, d, true),
          severity: d.severity,
          message: d.text,
        })),
    )
  }, [diagnosticsVersion, activePath])

  // Build-error clicks: jump to the requested file/line/col.
  const jump = useStore(s => s.jump)
  const jumpPath = useStore(s => s.activePath)
  useEffect(() => {
    if (!jump?.n || !viewRef.current || jumpPath !== jump.path) return
    const pos = posFromLineCol(viewRef.current.state.doc.toString(), { line: jump.line, column: jump.column })
    viewRef.current.focus()
    viewRef.current.dispatch({ selection: EditorSelection.cursor(pos), scrollIntoView: true })
  }, [jump?.n, jumpPath])


  if (activePath === null) {
    return (
      <div className="h-full grid place-items-center gap-3 text-neutral-500 select-none">
        <div className="text-center space-y-2">
          <div>No file open</div>
          <button
            onClick={() => { const p = prompt('New file (e.g. utils/helpers.ts):'); if (p) actions.addFile(p.trim()) }}
            className="px-3 py-2 rounded border border-[#23282f] text-xs hover:text-neutral-200 focus-visible:outline focus-visible:outline-amber-400"
          >
            New file
          </button>
        </div>
      </div>
    )
  }
  return <div ref={viewHost} className="h-full w-full overflow-hidden" data-testid="editor" />
}
