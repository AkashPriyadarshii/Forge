// Lazily loads Prettier only when the user asks for a format.
// Plugins are separate chunks; nothing lands in the main bundle.
type Format = (source: string, options?: import('prettier').Options) => Promise<string>
let cached: Promise<Format> | null = null

function formatWith(): Promise<Format> {
  return Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/typescript'),
    import('prettier/plugins/postcss'),
    import('prettier/plugins/html'),
  ]).then(([prettier, babel, estree, typescript, postcss, html]) => {
    // prettier.format's options type conflicts with the spread — use the loose call
    const format = prettier.format as unknown as Format
    return (source, options) => format(source, { plugins: [babel, estree, typescript, postcss, html], ...options })
  })
}

const parserFor = (path: string): string | null => {
  if (/\.tsx?$/.test(path)) return 'typescript'
  if (/\.jsx?$/.test(path)) return 'babel'
  if (/\.css$/.test(path)) return 'css'
  if (/\.json$/.test(path)) return 'json'
  if (/\.(html?)$/.test(path)) return 'html'
  return null
}

/** Formats a file's content; returns null for paths without a Prettier parser. */
export async function formatCode(path: string, content: string): Promise<string | null> {
  const parser = parserFor(path)
  if (!parser) return null
  cached ??= formatWith()
  const format = await cached
  try {
    return await format(content, { parser, semi: false, singleQuote: true, printWidth: 100 })
  } catch {
    return null // unparsable source — leave the user's bytes alone
  }
}
