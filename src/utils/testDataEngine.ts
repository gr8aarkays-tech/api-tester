/**
 * Test Data Generation Engine
 * Generates new records that satisfy existing conditions / constraints / relationships.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  TdFieldCondition,
  TdGenerationMode,
  TdValidationResult,
} from '../types'
import type { DbConnection } from '../types'
import { fetchDbFieldValues } from '../services/dbClient'

// ─── RNG (seedable) ────────────────────────────────────────────────────────────

class SeededRng {
  private seed: number
  constructor(seed?: number) { this.seed = seed ?? Math.floor(Math.random() * 2 ** 31) }

  /** Mulberry32 — fast, good quality 32-bit integer PRNG */
  next(): number {
    this.seed |= 0
    this.seed = this.seed + 0x6d2b79f5 | 0
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)]
  }
}

// ─── Name / word banks ─────────────────────────────────────────────────────────

const FIRST_NAMES = ['Alice','Bob','Carol','David','Eve','Frank','Grace','Hank','Iris','Jack','Kate','Leo','Mia','Noah','Olivia','Paul','Quinn','Rose','Sam','Tina','Ursula','Victor','Wendy','Xander','Yara','Zoe']
const LAST_NAMES  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Martinez','Anderson','Taylor','Thomas','Jackson','White','Harris','Martin','Thompson','Young','Lee']
const DOMAINS     = ['example.com','test.org','demo.net','sample.io','dummy.co']
const CITIES      = ['New York','Los Angeles','Chicago','Houston','Phoenix','Mumbai','Delhi','Bangalore','Chennai','Kolkata']
const COUNTRIES   = ['India','USA','UK','Canada','Australia','Germany','France','Japan','Brazil','Singapore']

// ─── Single-field generators ───────────────────────────────────────────────────

function genPattern(pattern: string, rng: SeededRng): string {
  // Replace {Nd} → N random digits, {Na} → N random letters, {Ns} → N alphanum
  return pattern
    .replace(/\{(\d+)d\}/g, (_, n) => Array.from({ length: +n }, () => rng.int(0, 9)).join(''))
    .replace(/\{(\d+)a\}/g, (_, n) => Array.from({ length: +n }, () => String.fromCharCode(rng.int(65, 90))).join(''))
    .replace(/\{(\d+)s\}/g, (_, n) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      return Array.from({ length: +n }, () => chars[rng.int(0, chars.length - 1)]).join('')
    })
}

function genRegexLike(regex: string, rng: SeededRng, min = 5, max = 15): string {
  // Very simplified: extract character classes and literals
  const len = rng.int(min, max)
  const chars: string[] = []
  if (regex.includes('[0-9]') || regex.includes('\\d')) chars.push(...'0123456789'.split(''))
  if (regex.includes('[a-z]')) chars.push(...'abcdefghijklmnopqrstuvwxyz'.split(''))
  if (regex.includes('[A-Z]')) chars.push(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
  if (regex.includes('[a-zA-Z]')) chars.push(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
  if (chars.length === 0) chars.push(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''))
  return Array.from({ length: len }, () => rng.pick(chars)).join('')
}

function genString(cond: TdFieldCondition, rng: SeededRng, mode: TdGenerationMode): string {
  if (cond.pattern) return genPattern(cond.pattern, rng)
  if (cond.regex)   return genRegexLike(cond.regex, rng, cond.minLength ?? 4, cond.maxLength ?? 12)
  const min = cond.minLength ?? 4
  const max = cond.maxLength ?? 12
  const first = FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)]
  const last  = LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)]
  const base  = `${first} ${last}`
  return base.slice(0, max).padEnd(min, 'x')
}

function genNumber(cond: TdFieldCondition, rng: SeededRng, mode: TdGenerationMode, isInt: boolean): number {
  const min = cond.minValue ?? 0
  const max = cond.maxValue ?? 10000
  if (mode === 'boundary') {
    const variants = [min, max, min - 1, max + 1]
    return rng.pick(variants)
  }
  if (mode === 'negative') return min - rng.int(1, 100)
  const val = min + rng.next() * (max - min)
  return isInt ? Math.round(val) : Math.round(val * 100) / 100
}

function genEmail(rng: SeededRng): string {
  const first = FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)].toLowerCase()
  const last  = LAST_NAMES[rng.int(0, LAST_NAMES.length - 1)].toLowerCase()
  const n     = rng.int(1, 999)
  const dom   = DOMAINS[rng.int(0, DOMAINS.length - 1)]
  return `${first}.${last}${n}@${dom}`
}

function genPhone(cond: TdFieldCondition, rng: SeededRng): string {
  // Check if there's a country dependency hint in pattern or format
  const fmt = (cond.format ?? cond.pattern ?? '').toLowerCase()
  if (fmt.includes('india') || fmt.includes('+91')) {
    return `+91${rng.int(6, 9)}${Array.from({ length: 9 }, () => rng.int(0, 9)).join('')}`
  }
  if (fmt.includes('us') || fmt.includes('+1')) {
    return `+1${rng.int(200, 999)}${rng.int(100, 999)}${rng.int(1000, 9999)}`
  }
  return `+${rng.int(1, 99)}${Array.from({ length: 10 }, () => rng.int(0, 9)).join('')}`
}

function genDate(cond: TdFieldCondition, rng: SeededRng, includeTime: boolean): string {
  const base = new Date(2000, 0, 1).getTime()
  const end  = new Date(2024, 11, 31).getTime()
  const ts   = base + rng.next() * (end - base)
  const d    = new Date(ts)
  const pad  = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (!includeTime) return date
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function genBoolean(rng: SeededRng, mode: TdGenerationMode): boolean {
  if (mode === 'boundary') return false
  return rng.next() > 0.5
}

// ─── Single record generator ───────────────────────────────────────────────────

function generateValue(
  cond: TdFieldCondition,
  record: Record<string, unknown>,
  rng: SeededRng,
  mode: TdGenerationMode,
  uniqueSets: Map<string, Set<string>>,
  attempt = 0,
  dbValuePools: Map<string, unknown[]> = new Map(),
): unknown {
  if (mode === 'negative' && cond.required && attempt === 0) {
    // Occasionally skip required fields for negative mode
    if (rng.next() < 0.2) return undefined
  }

  let value: unknown

  // ── DB-sourced value: pick from pre-fetched pool ──────────────────────────
  if (cond.dbSource && dbValuePools.has(cond.id)) {
    const pool = dbValuePools.get(cond.id)!
    if (pool.length > 0) {
      const pickMode = cond.dbSource.pickMode ?? 'random'
      if (pickMode === 'first') {
        value = pool[0]
      } else if (pickMode === 'sequential') {
        // Use attempt counter as cycle index via uniqueSets side-channel
        const seqKey = `__seq__${cond.id}`
        const seqSet = uniqueSets.get(seqKey) ?? new Set<string>()
        const idx = seqSet.size % pool.length
        seqSet.add(String(idx))         // just grow the set to track count
        uniqueSets.set(seqKey, seqSet)
        value = pool[idx]
      } else {
        value = pool[rng.int(0, pool.length - 1)]
      }
    }
    // fall through to regular generation if pool ended up empty
    if (value !== undefined) {
      // Uniqueness enforcement
      if (cond.unique && attempt < 20) {
        const set = uniqueSets.get(cond.id) ?? new Set<string>()
        const key = String(value)
        if (set.has(key)) {
          return generateValue(cond, record, rng, mode, uniqueSets, attempt + 1, dbValuePools)
        }
        set.add(key)
        uniqueSets.set(cond.id, set)
      }
      return value
    }
  }

  // Enum / allowed values take priority
  if (cond.allowedValues && cond.allowedValues.length > 0) {
    if (mode === 'negative') {
      // Generate something NOT in allowed list
      value = `INVALID_${rng.int(1000, 9999)}`
    } else if (mode === 'boundary') {
      value = rng.next() < 0.5 ? cond.allowedValues[0] : cond.allowedValues[cond.allowedValues.length - 1]
    } else {
      value = rng.pick(cond.allowedValues)
    }
  } else {
    switch (cond.type) {
      case 'string':  value = genString(cond, rng, mode); break
      case 'number':  value = genNumber(cond, rng, mode, false); break
      case 'integer': value = genNumber(cond, rng, mode, true); break
      case 'boolean': value = genBoolean(rng, mode); break
      case 'email':   value = genEmail(rng); break
      case 'phone':   value = genPhone(cond, rng); break
      case 'uuid':    value = uuidv4(); break
      case 'date':    value = genDate(cond, rng, false); break
      case 'datetime':value = genDate(cond, rng, true); break
      case 'regex':   value = cond.regex ? genRegexLike(cond.regex, rng) : genString(cond, rng, mode); break
      case 'enum':    value = cond.allowedValues ? rng.pick(cond.allowedValues) : `ENUM_${rng.int(1,5)}`; break
      case 'custom':  value = cond.defaultValue ?? `CUSTOM_${rng.int(1000,9999)}`; break
      default:        value = genString(cond, rng, mode)
    }
  }

  // Uniqueness enforcement (retry up to 20 times)
  if (cond.unique && attempt < 20) {
    const set = uniqueSets.get(cond.id) ?? new Set<string>()
    const key = String(value)
    if (set.has(key)) {
      return generateValue(cond, record, rng, mode, uniqueSets, attempt + 1, dbValuePools)
    }
    set.add(key)
    uniqueSets.set(cond.id, set)
  }

  return value
}

// ─── Relationship resolver ─────────────────────────────────────────────────────

function applyDependencies(
  conditions: TdFieldCondition[],
  record: Record<string, unknown>,
  rng: SeededRng,
  mode: TdGenerationMode,
): void {
  for (const cond of conditions) {
    if (!cond.dependencies) continue
    const fieldValue = String(record[cond.name] ?? '')
    for (const dep of cond.dependencies) {
      if (dep.triggerValue === '*' || fieldValue === dep.triggerValue || fieldValue.toLowerCase() === dep.triggerValue.toLowerCase()) {
        const targetCond = conditions.find((c) => c.name === dep.targetField)
        if (!targetCond) continue
        // Parse expression: plain value OR range like ">= 20000"
        const expr = dep.targetExpr.trim()
        const rangeMatch = expr.match(/^(>=|<=|>|<)\s*(\d+(?:\.\d+)?)$/)
        if (rangeMatch) {
          const op  = rangeMatch[1]
          const num = parseFloat(rangeMatch[2])
          const min = targetCond.minValue ?? 0
          const max = targetCond.maxValue ?? num * 2
          if (op === '>=' || op === '>') {
            const lower = op === '>=' ? num : num + 1
            record[dep.targetField] = Math.round(lower + rng.next() * (max - lower))
          } else {
            const upper = op === '<=' ? num : num - 1
            record[dep.targetField] = Math.round(min + rng.next() * (upper - min))
          }
        } else {
          // Plain value
          record[dep.targetField] = expr
        }
      }
    }
  }
}

// ─── Generate a single record ──────────────────────────────────────────────────

function generateRecord(
  conditions: TdFieldCondition[],
  rng: SeededRng,
  mode: TdGenerationMode,
  uniqueSets: Map<string, Set<string>>,
  dbValuePools: Map<string, unknown[]> = new Map(),
): Record<string, unknown> {
  const record: Record<string, unknown> = {}

  // First pass: generate each field independently
  for (const cond of conditions) {
    if (!cond.required && mode !== 'negative' && rng.next() < 0.1) {
      // 10% chance to omit optional fields
      continue
    }
    record[cond.name] = generateValue(cond, record, rng, mode, uniqueSets, 0, dbValuePools)
  }

  // Second pass: resolve inter-field dependencies
  applyDependencies(conditions, record, rng, mode)

  return record
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  count: number
  mode: TdGenerationMode
  seed?: number
  avoidDuplicates?: boolean
  existingRecords?: Record<string, unknown>[]
  /** Pre-fetched DB value pools keyed by TdFieldCondition.id — populated by generateTestDataAsync */
  dbValuePools?: Map<string, unknown[]>
}

export interface GenerateResult {
  records: Record<string, unknown>[]
  validationResults: TdValidationResult[]
  stats: {
    requested: number
    generated: number
    passed: number
    failed: number
    duplicatesAvoided: number
  }
}

export function generateTestData(
  conditions: TdFieldCondition[],
  opts: GenerateOptions,
): GenerateResult {
  const rng = new SeededRng(opts.seed)
  const uniqueSets = new Map<string, Set<string>>()

  // Seed unique sets from existing records so new records don't clash
  if (opts.avoidDuplicates && opts.existingRecords) {
    for (const rec of opts.existingRecords) {
      for (const cond of conditions) {
        if (!cond.unique) continue
        const set = uniqueSets.get(cond.id) ?? new Set<string>()
        const v = rec[cond.name]
        if (v !== undefined && v !== null) set.add(String(v))
        uniqueSets.set(cond.id, set)
      }
    }
  }

  const records: Record<string, unknown>[] = []
  const allValidation: TdValidationResult[] = []
  let duplicatesAvoided = 0
  let attempts = 0
  const maxAttempts = opts.count * 5

  while (records.length < opts.count && attempts < maxAttempts) {
    attempts++
    const rec = generateRecord(conditions, rng, opts.mode, uniqueSets, opts.dbValuePools ?? new Map())
    const results = validateRecord(conditions, rec, records.length)

    const invalid = results.filter((r) => !r.passed)
    if (invalid.length > 0 && opts.mode !== 'negative') {
      // Retry
      continue
    }

    // Duplicate check (full-record)
    if (opts.avoidDuplicates && opts.existingRecords) {
      const recStr = JSON.stringify(rec)
      const isDup = opts.existingRecords.some((e) => JSON.stringify(e) === recStr)
        || records.some((e) => JSON.stringify(e) === recStr)
      if (isDup) { duplicatesAvoided++; continue }
    }

    allValidation.push(...results)
    records.push(rec)
  }

  const passed = allValidation.filter((r) => r.passed).length
  const failed = allValidation.filter((r) => !r.passed).length

  return {
    records,
    validationResults: allValidation,
    stats: {
      requested: opts.count,
      generated: records.length,
      passed,
      failed,
      duplicatesAvoided,
    },
  }
}

// ─── Async variant (resolves DB-sourced fields before generation) ──────────────

/**
 * Same as `generateTestData` but first fetches DB value pools for any field
 * that has a `dbSource` configured, then runs the synchronous engine.
 *
 * `connections` must include all connections referenced by field `dbSource`s.
 */
export async function generateTestDataAsync(
  conditions: TdFieldCondition[],
  opts: GenerateOptions,
  connections: DbConnection[],
): Promise<GenerateResult> {
  const dbValuePools = new Map<string, unknown[]>()

  // Collect unique DB sources to avoid hitting the same query twice
  const dbFields = conditions.filter((c) => c.dbSource && c.dbSource.connectionId && c.dbSource.sql && c.dbSource.column)

  await Promise.all(
    dbFields.map(async (cond) => {
      const src = cond.dbSource!
      const conn = connections.find((c) => c.id === src.connectionId)
      if (!conn) return
      try {
        const { values } = await fetchDbFieldValues(conn, src.sql, src.column)
        if (values && values.length > 0) {
          dbValuePools.set(cond.id, values)
        }
      } catch {
        // silently fall back to regular generation for this field
      }
    }),
  )

  return generateTestData(conditions, { ...opts, dbValuePools })
}

// ─── Validation ────────────────────────────────────────────────────────────────

export function validateRecord(
  conditions: TdFieldCondition[],
  record: Record<string, unknown>,
  index = 0,
): TdValidationResult[] {
  const results: TdValidationResult[] = []

  for (const cond of conditions) {
    const val = record[cond.name]

    // Required
    if (cond.required && (val === undefined || val === null || val === '')) {
      results.push({ passed: false, recordIndex: index, field: cond.name, rule: 'required', message: `${cond.name} is required` })
      continue
    }
    if (val === undefined || val === null) { results.push({ passed: true, recordIndex: index, field: cond.name, rule: 'optional', message: '' }); continue }

    // Enum
    if (cond.allowedValues?.length) {
      const ok = cond.allowedValues.includes(String(val))
      results.push({ passed: ok, recordIndex: index, field: cond.name, rule: 'enum', message: ok ? '' : `${cond.name}: "${val}" not in allowed values` })
    }

    // Range
    if (cond.type === 'number' || cond.type === 'integer') {
      const num = Number(val)
      if (cond.minValue !== undefined && num < cond.minValue) {
        results.push({ passed: false, recordIndex: index, field: cond.name, rule: 'minValue', message: `${cond.name}: ${num} < min ${cond.minValue}` })
      } else if (cond.maxValue !== undefined && num > cond.maxValue) {
        results.push({ passed: false, recordIndex: index, field: cond.name, rule: 'maxValue', message: `${cond.name}: ${num} > max ${cond.maxValue}` })
      } else {
        results.push({ passed: true, recordIndex: index, field: cond.name, rule: 'range', message: '' })
      }
    }

    // Length
    if (typeof val === 'string') {
      const len = val.length
      if (cond.minLength !== undefined && len < cond.minLength) {
        results.push({ passed: false, recordIndex: index, field: cond.name, rule: 'minLength', message: `${cond.name}: length ${len} < ${cond.minLength}` })
      } else if (cond.maxLength !== undefined && len > cond.maxLength) {
        results.push({ passed: false, recordIndex: index, field: cond.name, rule: 'maxLength', message: `${cond.name}: length ${len} > ${cond.maxLength}` })
      }
    }

    // Regex / Pattern validation
    if (cond.regex && typeof val === 'string') {
      try {
        const re = new RegExp(cond.regex)
        const ok = re.test(val)
        results.push({ passed: ok, recordIndex: index, field: cond.name, rule: 'regex', message: ok ? '' : `${cond.name}: "${val}" does not match pattern` })
      } catch { /* invalid regex, skip */ }
    }

    results.push({ passed: true, recordIndex: index, field: cond.name, rule: 'type', message: '' })
  }

  return results
}

// ─── Schema inference from JSON data ──────────────────────────────────────────

export function inferConditionsFromData(data: unknown[]): TdFieldCondition[] {
  if (!data.length) return []
  const sample = data[0] as Record<string, unknown>
  const conditions: TdFieldCondition[] = []

  for (const [key, val] of Object.entries(sample)) {
    const allVals = data.map((r) => (r as Record<string, unknown>)[key]).filter((v) => v !== undefined && v !== null)
    const uniqueVals = [...new Set(allVals.map(String))]
    const cond: TdFieldCondition = {
      id: uuidv4(),
      name: key,
      type: inferType(val),
      required: allVals.length === data.length,
      unique: uniqueVals.length === allVals.length && allVals.length > 1,
    }

    // Infer enums if ≤ 10 unique string values
    if (cond.type === 'string' && uniqueVals.length <= 10 && uniqueVals.length > 1) {
      cond.type = 'enum'
      cond.allowedValues = uniqueVals
    }

    // Infer numeric ranges
    if (cond.type === 'number' || cond.type === 'integer') {
      const nums = allVals.map(Number).filter((n) => !isNaN(n))
      if (nums.length) {
        cond.minValue = Math.min(...nums)
        cond.maxValue = Math.max(...nums)
      }
    }

    // Infer pattern for strings like "C10001"
    if (cond.type === 'string' && typeof val === 'string') {
      const patternGuess = inferPattern(val)
      if (patternGuess) cond.pattern = patternGuess
    }

    // Infer email
    if (typeof val === 'string' && /^[^@]+@[^@]+\.[^@]+$/.test(val)) cond.type = 'email'

    conditions.push(cond)
  }

  return conditions
}

function inferType(val: unknown): TdFieldCondition['type'] {
  if (typeof val === 'boolean') return 'boolean'
  if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'number'
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return 'datetime'
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'date'
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(val)) return 'uuid'
    if (/^[^@]+@[^@]+\.[^@]+$/.test(val)) return 'email'
    if (/^\+?\d{7,15}$/.test(val)) return 'phone'
  }
  return 'string'
}

function inferPattern(val: string): string | undefined {
  // e.g. "C10001" → "C{5d}"
  const m = val.match(/^([A-Za-z]+)(\d+)$/)
  if (m) return `${m[1]}{${m[2].length}d}`
  return undefined
}
