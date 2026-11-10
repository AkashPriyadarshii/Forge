// Path resolution over the virtual FS: worker + tests import this, not the worker module.
export function resolveRelative(importer: string, spec: string): string {
  const dir = importer.split('/').slice(0, -1).join('/')
  const parts = (dir ? dir + '/' : '') + spec
  const stack: string[] = []
  for (const seg of parts.split('/')) {
    if (seg === '..') stack.pop()
    else if (seg !== '.') stack.push(seg)
  }
  return stack.join('/')
}

/** A path safe to create/open in the virtual FS: no traversal, absolute, or backslash. */
export function isValidPath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') &&
    !path.split('/').some(s => s === '..')
}
