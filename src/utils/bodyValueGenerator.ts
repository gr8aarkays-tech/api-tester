/**
 * bodyValueGenerator.ts
 *
 * Regenerates values inside a JSON or XML body while preserving the exact
 * structure, field names, and value types/formats.
 *
 * Rules
 * ─────
 * number  – integers keep the same digit-count; year-like (1900-2099) stay in
 *            year range; decimals keep the same precision
 * string  – pattern detected and regenerated:
 *             UUID       → new UUID (same hyphen layout)
 *             email      → new plausible email (same domain)
 *             date       → nearby date (±365 days)
 *             ISO-8601   → nearby datetime
 *             numeric ID → same length, same digit count
 *             alphaNum   → same length, same character-class layout
 *             plain text → shuffled words / kept as-is (short strings left alone)
 * boolean – random true/false
 * null    – stays null
 * array   – each element regenerated with the same rules
 * object  – recursed
 */

// ── helpers ────────────────────────────────────────────────────────────────

const RNG = () => Math.random()

function randInt(min: number, max: number): number {
  return Math.floor(RNG() * (max - min + 1)) + min
}

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const HEX   = '0123456789abcdef'

function randChar(pool: string): string {
  return pool[randInt(0, pool.length - 1)]
}

function randomHex(len: number): string {
  return Array.from({ length: len }, () => randChar(HEX)).join('')
}

function randomUUID(): string {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${randChar('89ab')}${randomHex(3)}-${randomHex(12)}`
}

function sameCase(orig: string, replacement: string): string {
  if (orig === orig.toUpperCase()) return replacement.toUpperCase()
  if (orig === orig.toLowerCase()) return replacement.toLowerCase()
  return replacement
}

// ── UUID ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── date / datetime ────────────────────────────────────────────────────────

const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

function nearbyDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  d.setDate(d.getDate() + randInt(-365, 365))
  return d.toISOString().slice(0, 10)
}

function nearbyDatetime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  d.setDate(d.getDate() + randInt(-365, 365))
  d.setSeconds(d.getSeconds() + randInt(-3600, 3600))
  // preserve original suffix (Z, +00:00, etc.)
  const suffix = iso.slice(19)
  return d.toISOString().slice(0, 19) + suffix
}

// ── email ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIRST_NAMES = ['alex','sam','jordan','morgan','taylor','casey','drew','blake','quinn','riley']
const LAST_NAMES  = ['smith','jones','brown','davis','wilson','miller','moore','taylor','lee','kim']

function regenerateEmail(orig: string): string {
  const atIdx = orig.lastIndexOf('@')
  const domain = orig.slice(atIdx + 1) // preserve domain
  const fn = FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)]
  const ln = LAST_NAMES[randInt(0, LAST_NAMES.length - 1)]
  const sep = RNG() > 0.5 ? '.' : '_'
  return `${fn}${sep}${ln}@${domain}`
}

// ── alphanumeric ID (same layout) ──────────────────────────────────────────

function regenerateAlphaNum(orig: string): string {
  return Array.from(orig).map((ch) => {
    if (/\d/.test(ch)) return randChar(DIGITS)
    if (/[A-Z]/.test(ch)) return randChar(UPPER)
    if (/[a-z]/.test(ch)) return randChar(LOWER)
    return ch // preserve separators like -, _, /
  }).join('')
}

// ── number ─────────────────────────────────────────────────────────────────

function regenerateNumber(n: number): number {
  // year-like: keep in valid year range
  if (Number.isInteger(n) && n >= 1900 && n <= 2099) {
    const delta = randInt(1, 5) * (RNG() > 0.5 ? 1 : -1)
    return Math.min(2099, Math.max(1900, n + delta))
  }
  // decimal: keep same precision
  const str = String(n)
  const dotIdx = str.indexOf('.')
  if (dotIdx !== -1) {
    const decimals = str.length - dotIdx - 1
    const scale = Math.pow(10, decimals)
    const range = Math.abs(n) * 0.3 || 1
    return parseFloat((n + (RNG() * 2 - 1) * range).toFixed(decimals))
  }
  // integer: keep same digit count
  const digits = str.replace('-', '').length
  const min = digits === 1 ? 0 : Math.pow(10, digits - 1)
  const max = Math.pow(10, digits) - 1
  const result = randInt(min, max)
  return n < 0 ? -result : result
}

// ── string ─────────────────────────────────────────────────────────────────

function regenerateString(s: string): string {
  if (s === '') return s

  if (UUID_RE.test(s)) return sameCase(s, randomUUID())
  if (EMAIL_RE.test(s)) return regenerateEmail(s)
  if (DATETIME_RE.test(s)) return nearbyDatetime(s)
  if (DATE_RE.test(s)) return nearbyDate(s)

  // purely numeric string (e.g. "12345") → same length digits
  if (/^\d+$/.test(s)) return String(randInt(Math.pow(10, s.length - 1), Math.pow(10, s.length) - 1))

  // alphanumeric with consistent digit/letter mix (IDs, tokens, etc.)
  if (/^[A-Za-z0-9\-_/]+$/.test(s) && s.length <= 64) return regenerateAlphaNum(s)

  // longer plain text: return as-is (avoid mangling readable strings)
  return s
}

// ── core recursive regenerator ─────────────────────────────────────────────

function regenerateValue(val: unknown): unknown {
  if (val === null || val === undefined) return val
  if (typeof val === 'boolean') return RNG() > 0.5
  if (typeof val === 'number') return regenerateNumber(val)
  if (typeof val === 'string') return regenerateString(val)
  if (Array.isArray(val)) return val.map(regenerateValue)
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = regenerateValue(v)
    }
    return out
  }
  return val
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Parse `json`, regenerate every value, return prettified JSON string.
 * Returns the original string unchanged if it can't be parsed.
 */
export function generateJsonBody(json: string): string {
  try {
    const parsed = JSON.parse(json)
    const regenerated = regenerateValue(parsed)
    return JSON.stringify(regenerated, null, 2)
  } catch {
    return json
  }
}

/**
 * Walk XML text nodes and regenerate their values using the same rules.
 * Tag names, attributes, and structure are preserved.
 * Returns the original string unchanged if it can't be processed.
 */
export function generateXmlBody(xml: string): string {
  // Replace content between tags (text nodes only, skip CDATA / comments)
  return xml.replace(/>([^<]+)</g, (_match, text: string) => {
    const trimmed = text.trim()
    if (trimmed === '') return `>${text}<`

    // Try to interpret as number
    const asNum = Number(trimmed)
    if (!isNaN(asNum) && trimmed !== '') {
      return `>${regenerateNumber(asNum)}<`
    }

    // Treat as string
    const regenerated = regenerateString(trimmed)
    // Preserve surrounding whitespace
    const leading  = text.match(/^\s*/)?.[0] ?? ''
    const trailing = text.match(/\s*$/)?.[0] ?? ''
    return `>${leading}${regenerated}${trailing}<`
  })
}
