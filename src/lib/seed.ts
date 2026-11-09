import type { Project } from '../types'

export const DEFAULT_FILES: { path: string; content: string }[] = [
  {
    path: 'index.html',
    content: `<!doctype html>
<html>
  <head>
    <title>Forge demo</title>
    <link rel="stylesheet" href="style.css">
    <script src="main.ts"></script>
  </head>
  <body>
    <main>
      <h1>Hello from Forge</h1>
      <p>Edit any file — the preview rebuilds automatically.</p>
      <button id="btn">Clicked 0 times</button>
    </main>
  </body>
</html>`,
  },
  {
    path: 'style.css',
    content: `body {
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: #0b0d10;
  color: #e8e6e1;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
}
button {
  padding: 8px 16px;
  border: 1px solid #666;
  border-radius: 6px;
  background: #16191d;
  color: inherit;
  cursor: pointer;
}
button:hover { border-color: #999 }`,
  },
  {
    path: 'main.ts',
    content: `const btn = document.getElementById('btn') as HTMLButtonElement
let count = 0
btn.onclick = () => {
  count++
  btn.textContent = \`Clicked \${count} times\`
  console.log('clicked', { count })
}`,
  },
]

export function defaultProject(name: string): Project {
  return {
    format: 1,
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: DEFAULT_FILES.map(f => ({ ...f })),
  }
}
