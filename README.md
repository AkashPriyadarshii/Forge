# Forge

A browser-native code editor that runs your JavaScript without a server. Type in one pane, see it run in the next — files persist in your browser, and the whole app is static HTML you can host anywhere.

Built as a portfolio piece: real worker-based esbuild bundling, sandboxed previews, IndexedDB persistence, and keyboard-first UX in a ~265 KB (gzipped) app.

## Features

- **Multi-file projects** — tabs, file tree, and a live CodeMirror 6 editor with JS/TS/HTML/CSS grammars.
- **Instant bundling** — esbuild-wasm runs inside a Web Worker; edits rebuild off the main thread with latest-wins orchestration (never a stale preview).
- **Sandboxed preview** — your code runs in an opaque-origin iframe; the console pane captures `log/warn/error`, uncaught errors and rejections via a postMessage bridge.
- **Local-first storage** — projects persist in IndexedDB with storage persistence requested; export/import as `.forge.json` any time.
- **Share by URL** — small projects encode into the URL hash (deflate + base64url); oversized ones export a file.
- **Keyboard-first** — `Ctrl+Enter` run · `Ctrl+K` command palette · `Ctrl+S` autosaves (already continuous).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173/Forge/
npm run build      # typecheck + production build
npm test           # vitest (share/paths/orchestrator units)
```

Deployed at `akashpriyadarshii.github.io/Forge` via GitHub Actions.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the ADRs for the esbuild-worker, storage-origin, sharing, and sandboxing decisions.

## Known limits

- No TypeScript IntelliSense yet (esbuild strips types; see ADR-0002).
- Bare npm imports resolve at runtime via esm.sh — no lockfiles.
- Single Graph builds; no WASM or multi-entry yet.
