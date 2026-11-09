# Forge ADRs

## ADR-0001: esbuild-wasm in a Web Worker (vs Monaco / Rollup / Rolldown)

esbuild's WASM build bundles JS/TS/CSS in ~100–400 ms for small projects, single
dependency, runs inside a worker off the main thread. Rolldown 1.3 `@rolldown/browser`
is the swap candidate if esbuild's capabilities ever cap out. Monaco was rejected:
a 2–5 MB VS Code engine for only editing features, and esbuild handles bundling anyway.

## ADR-0002: No TypeScript type-checking — JS-first, honestly

val-town/codemirror-ts is archived; browser TS toolchains (sandlot's `@typescript/vfs`)
work but aren't a real tsc. esbuild strips types at bundling — no type errors, only
syntax. MVP states this plainly in the README; revisit when a stable browser
type-checker surfaces.

## ADR-0003: origin scoping of persisted projects

GitHub Pages serves every project repo from the same origin —
`akashpriyadarshii.github.io/Forge` and `/Resonance` share one IndexedDB. The DB is
named `forge-projects` and the schema is versioned (`forge:format=1`, 256-file cap),
so a future split to a dedicated hostname can seed itself and a future app sharing
this origin reads only Forge's own namespaced store.

## ADR-0004: inline the bundle in the preview srcdoc

Sandboxed iframes run in an opaque origin; opaque origins cannot fetch the parent
origin's blob: URLs (browser-level security). Every avenue to reference a parent
blob fails — `Not allowed to load local resource: blob:...`. The correct minimal
design is injection: the worker returns the bundled js/css/html strings and
`generatePreviewHtml` embeds them directly into the srcdoc, escaping `</script>`.
No blob URLs, no revocation bookkeeping, no fourth-URL escape hatch.

## ADR-0005: share-by-URL caps

URLs carry deflate-raw + base64url of the project JSON, capped at 16K characters.
Beyond that, sharing falls back to a downloadable `.forge.json` file (import via
command palette). Path traversal (`..`, absolute) and over-large snapshots are
rejected at import.
