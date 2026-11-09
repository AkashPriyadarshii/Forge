import { useEffect, useMemo, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { indentWithTab, history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { javascript } from '@codemirror/lang-javascript'
import { html as htmlLang } from '@codemirror/lang-html'
import { css as cssLang } from '@codemirror/lang-css'
import { linter, lintGutter, lintKeymap } from '@codemirror/lint'
import { bracketMatching, indentOnInput, foldGutter, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { actions, getState, useStore } from '../store'

// Forge syntax palette — one accent (amber), warm neutrals, structured density.
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
      syntaxHighlighting(forgeHighlight),
      lintGutter(),
      lintSource,
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
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
    return () => {
      states.current.set(activePath, view.state)
      view.destroy()
    }
  }, [activePath, extensions])
  void diagnosticsVersion // lint re-runs on new build results


  if (activePath === null) {
    return <div className="h-full grid place-items-center text-neutral-500 select-none">No file open</div>
  }
  return <div ref={viewHost} className="h-full w-full overflow-hidden" data-testid="editor" />
}
