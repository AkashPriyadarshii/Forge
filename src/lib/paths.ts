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
