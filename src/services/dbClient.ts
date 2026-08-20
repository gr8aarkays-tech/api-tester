/**
 * dbClient.ts
 *
 * Communicates with the local backend API server for all database operations.
 * The backend (server/index.js) handles actual DB driver connections so that
 * credentials never stay in the browser.
 *
 * When VITE_DB_BACKEND is not set we default to http://localhost:4001.
 * The shared secret (VITE_BACKEND_SECRET) must match the server's BACKEND_SECRET.
 */

import type { DbConnection, DbQueryResult, DbVariables } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env ?? {}
const BASE: string = (_env.VITE_DB_BACKEND as string | undefined) ?? 'http://localhost:4001'
const BACKEND_SECRET: string = (_env.VITE_BACKEND_SECRET as string | undefined) ?? 'dev-secret'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Tester-Secret': BACKEND_SECRET,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error((err as { message?: string }).message ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export interface TestConnectionResult {
  success: boolean
  message: string
}

/** Test a DB connection without saving it */
export async function testConnection(conn: DbConnection): Promise<TestConnectionResult> {
  return post<TestConnectionResult>('/db/test', conn)
}

export interface RunQueryPayload {
  connection: DbConnection
  sql: string
  params?: Record<string, unknown>
}

/** Execute a SQL query and return results */
export async function runQuery(payload: RunQueryPayload): Promise<DbQueryResult> {
  return post<DbQueryResult>('/db/query', payload)
}

/**
 * Resolve {{db.COLUMN}} placeholders using a variables map.
 * Done client-side – no backend call needed.
 */
export function resolveDbVars(text: string, vars: DbVariables): string {
  return text.replace(/\{\{db\.([A-Za-z0-9_]+)\}\}/g, (_, col) => {
    const val = vars[col] ?? vars[col.toUpperCase()] ?? vars[col.toLowerCase()]
    return val !== undefined ? String(val) : `{{db.${col}}}`
  })
}

/**
 * Extract all {{db.XXX}} variable names referenced in a string.
 */
export function extractDbVarNames(text: string): string[] {
  const matches = text.match(/\{\{db\.([A-Za-z0-9_]+)\}\}/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.slice(5, -2)))]
}

/**
 * Build DbVariables from a query result row.
 * Uses first-row by default; callers can pass a specific rowIndex.
 */
export function buildDbVariables(result: DbQueryResult, rowIndex = 0): DbVariables {
  if (!result.rows || result.rows.length === 0) return {}
  const row = result.rows[Math.min(rowIndex, result.rows.length - 1)]
  return { ...row } as DbVariables
}

/**
 * Fetch all distinct values for a column from a DB query.
 * Used by the Test Data Generator to resolve DB-sourced fields.
 */
export async function fetchDbFieldValues(
  connection: DbConnection,
  sql: string,
  column: string,
): Promise<{ values: unknown[]; error?: string }> {
  return post<{ values: unknown[]; error?: string }>('/db/query-values', { connection, sql, column })
}

/** Check if backend is reachable */
export async function pingBackend(): Promise<boolean> {
  try {
    // /health is unauthenticated — no secret header required
    const res = await fetch(`${BASE}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}
