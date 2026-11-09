# Forge — Architecture

Browser-native, local-first, multi-file code editor. No account, no backend, no server build step. Your code lives in your browser and is always yours.

## Stack

Vite 8 + React 19 + TypeScript (strict) + Tailwind 4 + CodeMirror 6 · esbuild-wasm in a Web Worker · IndexedDB persistence · sandboxed iframe preview.

## Modules

| Path | Role |
|---|---|
| `src/workers/bundler-worker.ts` | esbuild-wasm in a worker: virtual-FS plugin resolves relative imports, marks bare specifiers external (esm.sh at runtime), bundles JS/TS + CSS, strips local `<script src>`/`<link rel=stylesheet>` and returns the rewritten entry HTML plus diagnostics. |
| `src/lib/bundler.ts` | BuildOrchestrator: single-flight, latest-wins. At most one bundle in flight; newer snapshots coalesce into the next run; every coalesced caller receives the freshest result. Worker crash paths return an error BuildResult instead of a hung UI. |
| `src/lib/preview.ts` | Generates the preview srcdoc: console shim (postMessage bridge), esm.sh import map for bare imports, inlined bundled JS/CSS. Bundles are inlined because the sandboxed iframe runs in an opaque origin and cannot fetch the parent's blob URLs. |
| `src/lib/idb.ts` | IndexedDB (`forge-projects`) project store + `navigator.storage.persist()` request. |
| `src/lib/share.ts` | URL-hash sharing: deflate-raw + base64url, ≤16K URL. Rejects `..`, absolute paths; caps 256 files / 64K decompressed. Oversized projects export/import a `.forge.json` file instead. |
| `src/store.ts` | Framework-free store via `useSyncExternalStore`; 1s-debounced IndexedDB writes. |
| `src/components/EditorPane.tsx` | One live CodeMirror 6 instance; per-file `EditorState` swap (official multi-tab pattern). Lint gutter fed by esbuild diagnostics. |

## System model

```
Editor store ──(files)──> BuildOrchestrator ──(worker)──> esbuild-wasm
     │                                                        │
     │ IndexDB◄── persistSoon (1s debounce)           js+css+html+diagnostics
     │                                                        ▼
     └── diagnostics ──> CM lint gutter          generatePreviewHtml → sandboxed iframe
                                                              │ postMessage
                                                              ▼
                                                         Console pane
```

**Single-flight builds**: the orchestrator never delivers a stale result — if a build is running and new edits arrive, the newest snapshot replaces any queued one and callers resolve together with the freshest output.

**Auto-run**: file edits trigger a debounced rebuild (700 ms) when auto-run is on; failures keep the last good preview on screen.

## Security notes

- The preview iframe is fully sandboxed (`allow-scripts allow-forms allow-pointer-lock`), opaque origin, so user code cannot touch the editor page, storage, or cookies.
- Console messages cross a validated postMessage bridge (`forge: 'console'` only).
- Share snapshots are validated (paths checked against `..`/absolute traversal and file-count/size caps) before import.

## Known limits

- No TypeScript IntelliSense: esbuild strips types at bundling; type-checking awaits the sandbox toolchain (tracked in ADR-0002).
- Bare npm imports resolve at runtime via esm.sh — no lockfile, no node_modules.
- WASM bundling, multi-file shared workers, and PWA offline are phase 2.
