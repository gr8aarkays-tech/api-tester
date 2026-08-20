export function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function minifyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw))
  } catch {
    return raw
  }
}

export function isValidJson(raw: string): boolean {
  try { JSON.parse(raw); return true } catch { return false }
}

export function formatXml(raw: string): string {
  try {
    let formatted = ''
    let indent = 0
    const tab = '  '
    raw.replace(/>\s*</g, '>\n<').split('\n').forEach((node) => {
      const trimmed = node.trim()
      if (trimmed.match(/^<\/\w/)) indent--
      formatted += tab.repeat(Math.max(0, indent)) + trimmed + '\n'
      // Increment indent only for opening tags — NOT for:
      //   • self-closing tags  (<br />  or  <input type="text"/>)
      //   • closing tags       (</foo>)
      //   • inline elements    (<tag>value</tag> on one line)
      //   • processing instructions / declarations (<?xml …?>)
      const isOpening = trimmed.match(/^<[^/?!][^>]*[^/]>$/) && !trimmed.match(/^<.+<\/\w+>/)
      if (isOpening) indent++
    })
    return formatted.trim()
  } catch {
    return raw
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function getContentType(headers: Record<string, string>): string {
  return (headers['content-type'] || headers['Content-Type'] || '').toLowerCase()
}

export function detectBodyLanguage(headers: Record<string, string>, body: string): 'json' | 'xml' | 'html' | 'text' {
  const ct = getContentType(headers)
  if (ct.includes('json')) return 'json'
  if (ct.includes('xml')) return 'xml'
  if (ct.includes('html')) return 'html'
  // fallback detection
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  if (trimmed.startsWith('<')) return trimmed.includes('<html') ? 'html' : 'xml'
  return 'text'
}
