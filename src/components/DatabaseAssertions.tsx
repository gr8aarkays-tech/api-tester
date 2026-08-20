/**
 * DatabaseAssertions.tsx
 *
 * Database assertion builder rendered inside the Tests tab.
 * Lets users validate API response values against database query results.
 */
import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useDbStore } from '../store/dbStore'
import type { DbAssertion, ResponseData } from '../types'
import { runQuery } from '../services/dbClient'

interface Props {
  assertions: DbAssertion[]
  onChange: (a: DbAssertion[]) => void
  response: ResponseData | null
}

const OPERATORS: { value: DbAssertion['operator']; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'notEmpty', label: 'Not Empty' },
  { value: 'greaterThan', label: 'Greater Than' },
  { value: 'lessThan', label: 'Less Than' },
  { value: 'rowCount', label: 'Row Count Equals' },
  { value: 'jsonFieldVsDb', label: 'API JSON field == DB Column' },
]

function newAssertion(connectionId = ''): DbAssertion {
  return {
    id: uuidv4(),
    enabled: true,
    connectionId,
    sql: 'SELECT ',
    operator: 'equals',
    expectedValue: '',
    jsonPath: '',
  }
}

function evalAssertion(
  assertion: DbAssertion,
  dbValue: string,
  rowCount: number,
  response: ResponseData | null
): { passed: boolean; message: string } {
  const { operator, expectedValue, jsonPath } = assertion
  const exp = expectedValue.trim()

  if (operator === 'rowCount') {
    const passed = rowCount === Number(exp)
    return { passed, message: passed ? `Row count = ${rowCount}` : `Row count ${rowCount} ≠ ${exp}` }
  }

  if (operator === 'jsonFieldVsDb') {
    if (!response || !jsonPath) return { passed: false, message: 'No response or JSON path' }
    try {
      const body = JSON.parse(response.body)
      const parts = jsonPath.split('.')
      let val: unknown = body
      for (const p of parts) val = (val as Record<string, unknown>)?.[p]
      const match = String(val) === dbValue
      return { passed: match, message: match ? `${jsonPath} matches DB value "${dbValue}"` : `${jsonPath}="${String(val)}" ≠ DB "${dbValue}"` }
    } catch {
      return { passed: false, message: 'Could not parse response body' }
    }
  }

  if (operator === 'notEmpty') return { passed: dbValue !== '' && dbValue !== 'null', message: dbValue ? `Value is "${dbValue}"` : 'Value is empty' }
  if (operator === 'equals') return { passed: dbValue === exp, message: dbValue === exp ? `"${dbValue}" = "${exp}"` : `"${dbValue}" ≠ "${exp}"` }
  if (operator === 'notEquals') return { passed: dbValue !== exp, message: dbValue !== exp ? `"${dbValue}" ≠ "${exp}"` : 'Values are equal' }
  if (operator === 'contains') return { passed: dbValue.includes(exp), message: dbValue.includes(exp) ? `Contains "${exp}"` : `"${dbValue}" does not contain "${exp}"` }
  if (operator === 'greaterThan') return { passed: Number(dbValue) > Number(exp), message: `${dbValue} > ${exp}: ${Number(dbValue) > Number(exp)}` }
  if (operator === 'lessThan') return { passed: Number(dbValue) < Number(exp), message: `${dbValue} < ${exp}: ${Number(dbValue) < Number(exp)}` }

  return { passed: false, message: 'Unknown operator' }
}

export default function DatabaseAssertions({ assertions, onChange, response }: Props) {
  const { connections, dbVariables } = useDbStore()
  const [results, setResults] = useState<Record<string, { passed: boolean; message: string; dbValue: string } | 'running'>>({})

  const add = () => onChange([...assertions, newAssertion()])
  const remove = (id: string) => onChange(assertions.filter((a) => a.id !== id))
  const update = (id: string, patch: Partial<DbAssertion>) =>
    onChange(assertions.map((a) => (a.id === id ? { ...a, ...patch } : a)))

  const runAssertion = async (a: DbAssertion) => {
    const conn = connections.find((c) => c.id === a.connectionId)
    if (!conn) return
    setResults((r) => ({ ...r, [a.id]: 'running' }))
    try {
      // Resolve {{db.X}} in SQL
      const resolvedSql = a.sql.replace(/\{\{db\.([A-Za-z0-9_]+)\}\}/g, (_, col) => {
        const v = dbVariables[col] ?? dbVariables[col.toUpperCase()]
        return v !== undefined ? String(v) : `{{db.${col}}}`
      })
      const result = await runQuery({ connection: conn, sql: resolvedSql })
      const dbValue = result.rows[0] ? String(Object.values(result.rows[0])[0] ?? '') : ''
      const eval_ = evalAssertion(a, dbValue, result.rowCount, response)
      setResults((r) => ({ ...r, [a.id]: { ...eval_, dbValue } }))
    } catch (e) {
      setResults((r) => ({ ...r, [a.id]: { passed: false, message: (e as Error).message, dbValue: '' } }))
    }
  }

  // Run all enabled assertions sequentially so errors in one don't affect others.
  const runAll = async () => {
    for (const a of assertions.filter((a) => a.enabled)) {
      await runAssertion(a)
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="text-muted font-semibold">Database Assertions</div>
        <div className="flex gap-1">
          {assertions.length > 0 && (
            <button className="btn btn-ghost text-xs py-0.5" onClick={runAll}>▶ Run All DB Assertions</button>
          )}
          <button className="btn btn-ghost text-xs py-0.5" onClick={add}>+ Add DB Assertion</button>
        </div>
      </div>

      {assertions.length === 0 && (
        <div className="text-muted text-xs text-center py-4">
          No DB assertions. Add one to validate API response against database values.
        </div>
      )}

      {assertions.map((a) => {
        const res = results[a.id]
        return (
          <div key={a.id} className={`flex flex-col gap-2 p-3 rounded border ${a.enabled ? 'border-border' : 'border-border/40 opacity-60'}`}>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={a.enabled}
                onChange={(e) => update(a.id, { enabled: e.target.checked })}
                className="accent-accent"
              />
              <span className="text-muted font-semibold">DB Assertion</span>
              <div className="flex-1" />
              <button className="btn btn-ghost text-xs py-0.5" onClick={() => runAssertion(a)} disabled={res === 'running'}>
                {res === 'running' ? '⏳' : '▶'}
              </button>
              <button className="btn btn-ghost text-xs py-0.5 text-danger" onClick={() => remove(a.id)}>✕</button>
            </div>

            {/* Connection */}
            <div className="flex gap-2">
              <label className="flex flex-col gap-0.5 w-40">
                <span className="text-muted">Connection</span>
                <select className="px-2 py-1" value={a.connectionId} onChange={(e) => update(a.id, { connectionId: e.target.value })}>
                  <option value="">— Select —</option>
                  {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 flex-1">
                <span className="text-muted">SQL Query</span>
                <input
                  className="px-2 py-1 font-mono"
                  value={a.sql}
                  onChange={(e) => update(a.id, { sql: e.target.value })}
                  placeholder="SELECT STATUS FROM CUSTOMER WHERE CUSTOMER_ID = {{db.CUSTOMER_ID}}"
                />
              </label>
            </div>

            {/* Operator + expected */}
            <div className="flex gap-2">
              <label className="flex flex-col gap-0.5 w-40">
                <span className="text-muted">Condition</span>
                <select className="px-2 py-1" value={a.operator} onChange={(e) => update(a.id, { operator: e.target.value as DbAssertion['operator'] })}>
                  {OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
              </label>
              {a.operator !== 'notEmpty' && (
                <label className="flex flex-col gap-0.5 flex-1">
                  <span className="text-muted">{a.operator === 'jsonFieldVsDb' ? 'JSON Path (response)' : 'Expected Value'}</span>
                  <input
                    className="px-2 py-1"
                    value={a.operator === 'jsonFieldVsDb' ? (a.jsonPath ?? '') : a.expectedValue}
                    onChange={(e) => update(a.id, a.operator === 'jsonFieldVsDb' ? { jsonPath: e.target.value } : { expectedValue: e.target.value })}
                    placeholder={a.operator === 'jsonFieldVsDb' ? 'data.customerId' : 'ACTIVE'}
                  />
                </label>
              )}
            </div>

            {/* Result */}
            {res && res !== 'running' && (
              <div className={`flex items-start gap-2 px-2 py-1.5 rounded ${res.passed ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                <span>{res.passed ? '✓' : '✗'}</span>
                <span>{res.message}</span>
                {res.dbValue && <span className="ml-auto text-muted font-mono">DB: "{res.dbValue}"</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
