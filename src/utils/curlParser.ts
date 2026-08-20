import type { ApiRequest, KeyValueItem } from '../types'
import { newKV } from '../types'
import { v4 as uuidv4 } from 'uuid'

/**
 * Normalise a multi-line cURL command (lines joined with " \\\n") into a
 * single string, and strip Windows-style line endings.
 */
function normaliseCurl(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    // Join backslash-continuation lines into one long line
    .replace(/\\\s*\n\s*/g, ' ')
    .trim()
}

/**
 * Parse a cURL command string into an ApiRequest.
 * Handles multi-line cURL (backslash continuations), quoted URLs with spaces,
 * and both --header / -H shorthand.
 */
export function parseCurl(curl: string): Partial<ApiRequest> {
  const normalised = normaliseCurl(curl)

  const req: Partial<ApiRequest> = {
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    bodyType: 'none',
    bodyJson: '',
    bodyRaw: '',
  }

  // Extract method — supports both "--request POST" and "-XPOST" / "-X POST"
  const methodMatch = normalised.match(/(?:--request|-X\s*)([A-Z]+)/i)
  if (methodMatch) {
    req.method = methodMatch[1].toUpperCase() as ApiRequest['method']
  }

  // Extract URL — match --url (with optional quotes) or bare curl <url>.
  // The value may contain query-string characters including spaces when quoted.
  const urlMatch = normalised.match(/--url\s+["']([^'"]+)["']|--url\s+(\S+)|curl\s+["']([^'"]+)["']|curl\s+(\S+)/)
  if (urlMatch) {
    const rawUrl = urlMatch[1] ?? urlMatch[2] ?? urlMatch[3] ?? urlMatch[4]
    try {
      const u = new URL(rawUrl)
      req.url = `${u.origin}${u.pathname}`
      const params: KeyValueItem[] = []
      u.searchParams.forEach((v, k) => params.push(newKV(k, v)))
      req.params = params
    } catch {
      req.url = rawUrl
    }
  }

  // Extract headers — supports both "--header" and "-H" shorthand.
  // Use a global scan over the normalised (single-line) string.
  const headerMatches = [...normalised.matchAll(/(?:--header|-H)\s+["']([^"']+)["']/gi)]
  const headers: KeyValueItem[] = []
  for (const m of headerMatches) {
    const parts = m[1].split(/:\s*(.+)/)
    if (parts.length >= 2) headers.push(newKV(parts[0], parts[1]))
  }
  req.headers = headers

  // Extract body — match --data variants with either quote style.
  const bodyMatch = normalised.match(/--data(?:-raw|-binary|-urlencode)?\s+(["'])([\s\S]*?)\1/i)
  if (bodyMatch) {
    const bodyText = bodyMatch[2]
    const trimmed = bodyText.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      req.bodyType = 'json'
      req.bodyJson = bodyText
    } else {
      req.bodyType = 'raw'
      req.bodyRaw = bodyText
    }
    if (!methodMatch) req.method = 'POST'
  }

  return req
}

/**
 * Generate a cURL command from an ApiRequest
 */
export function generateCurl(request: ApiRequest, envVars: Record<string, string> = {}): string {
  const resolve = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => envVars[k] ?? `{{${k}}}`)

  let url = resolve(request.url)
  const enabledParams = request.params.filter((p) => p.enabled && p.key)
  if (enabledParams.length > 0) {
    const qs = enabledParams.map((p) => `${encodeURIComponent(resolve(p.key))}=${encodeURIComponent(resolve(p.value))}`).join('&')
    url += (url.includes('?') ? '&' : '?') + qs
  }

  const lines: string[] = [`curl --request ${request.method} \\`, `  --url '${url}'`]

  for (const h of request.headers) {
    if (h.enabled && h.key) {
      lines[lines.length - 1] += ' \\'
      lines.push(`  --header '${h.key}: ${resolve(h.value)}'`)
    }
  }

  const auth = request.auth
  if (auth.type === 'bearer' && auth.token) {
    lines[lines.length - 1] += ' \\'
    lines.push(`  --header 'Authorization: Bearer ${resolve(auth.token)}'`)
  } else if (auth.type === 'basic') {
    lines[lines.length - 1] += ' \\'
    lines.push(`  --header 'Authorization: Basic ${btoa(`${resolve(auth.username ?? '')}:${resolve(auth.password ?? '')}`)}'`)
  } else if (auth.type === 'apikey' && auth.apiKeyIn === 'header') {
    lines[lines.length - 1] += ' \\'
    lines.push(`  --header '${resolve(auth.apiKeyName ?? '')}: ${resolve(auth.apiKeyValue ?? '')}'`)
  }

  if (request.bodyType !== 'none') {
    let bodyStr = ''
    if (request.bodyType === 'json') bodyStr = request.bodyJson
    else if (request.bodyType === 'xml') bodyStr = request.bodyXml
    else if (request.bodyType === 'raw') bodyStr = request.bodyRaw
    if (bodyStr) {
      lines[lines.length - 1] += ' \\'
      lines.push(`  --data '${bodyStr.replace(/'/g, "\\'")}'`)
    }
  }

  return lines.join('\n')
}
