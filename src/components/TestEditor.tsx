import React, { useState } from 'react'
import type { TestAssertion, DbAssertion, ResponseData } from '../types'
import { v4 as uuidv4 } from 'uuid'
import DatabaseAssertions from './DatabaseAssertions'

interface Props {
  tests: TestAssertion[]
  onChange: (tests: TestAssertion[]) => void
  results?: { name: string; passed: boolean; message?: string }[]
  dbAssertions?: DbAssertion[]
  onDbAssertionsChange?: (a: DbAssertion[]) => void
  response?: ResponseData | null
}

const TEST_TYPES = [
  { id: 'status', label: 'Status Code' },
  { id: 'responseTime', label: 'Response Time' },
  { id: 'contains', label: 'Body Contains' },
  { id: 'headerExists', label: 'Header Exists' },
  { id: 'headerEquals', label: 'Header Equals' },
  { id: 'jsonField', label: 'JSON Field' },
] as const

export default function TestEditor({ tests, onChange, results, dbAssertions, onDbAssertionsChange, response }: Props) {
  const addTest = (type: TestAssertion['type']) => {
    const t: TestAssertion = { id: uuidv4(), type, enabled: true }
    onChange([...tests, t])
  }

  const update = (id: string, patch: Partial<TestAssertion>) => {
    onChange(tests.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const remove = (id: string) => onChange(tests.filter((t) => t.id !== id))

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {/* Test results */}
      {results && results.length > 0 && (
        <div className="rounded border border-border p-2 bg-surface">
          <div className="text-xs font-semibold text-muted mb-2">Test Results</div>
          {results.map((r, i) => (
            <div key={i} className={`flex items-start gap-2 text-xs py-1 ${r.passed ? 'text-success' : 'text-danger'}`}>
              <span>{r.passed ? '✓' : '✗'}</span>
              <span className="flex-1">{r.name}</span>
              {r.message && <span className="text-muted">{r.message}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Assertions */}
      {tests.map((test) => (
        <div key={test.id} className="flex flex-col gap-2 p-2 border border-border rounded bg-surface">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={test.enabled} onChange={(e) => update(test.id, { enabled: e.target.checked })} className="accent-accent" />
            <select className="text-xs px-2 py-1" value={test.type} onChange={(e) => update(test.id, { type: e.target.value as TestAssertion['type'] })}>
              {TEST_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button onClick={() => remove(test.id)} className="ml-auto text-muted hover:text-danger text-xs">✕</button>
          </div>

          {test.type === 'status' && (
            <div className="flex items-center gap-2">
              <label className="text-muted text-xs w-28">Status Code equals</label>
              <input type="number" className="w-24 px-2 py-1 text-xs" value={test.statusCode ?? 200} onChange={(e) => update(test.id, { statusCode: +e.target.value })} />
            </div>
          )}

          {test.type === 'responseTime' && (
            <div className="flex items-center gap-2">
              <label className="text-muted text-xs w-28">Max response time</label>
              <input type="number" className="w-24 px-2 py-1 text-xs" value={test.maxMs ?? 1000} onChange={(e) => update(test.id, { maxMs: +e.target.value })} />
              <span className="text-muted text-xs">ms</span>
            </div>
          )}

          {test.type === 'contains' && (
            <div className="flex items-center gap-2">
              <label className="text-muted text-xs w-28">Body contains</label>
              <input className="flex-1 px-2 py-1 text-xs" placeholder="search text" value={test.searchText ?? ''} onChange={(e) => update(test.id, { searchText: e.target.value })} />
            </div>
          )}

          {(test.type === 'headerExists' || test.type === 'headerEquals') && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label className="text-muted text-xs w-28">Header name</label>
                <input className="flex-1 px-2 py-1 text-xs" placeholder="content-type" value={test.headerName ?? ''} onChange={(e) => update(test.id, { headerName: e.target.value })} />
              </div>
              {test.type === 'headerEquals' && (
                <div className="flex items-center gap-2">
                  <label className="text-muted text-xs w-28">equals</label>
                  <input className="flex-1 px-2 py-1 text-xs" placeholder="application/json" value={test.headerValue ?? ''} onChange={(e) => update(test.id, { headerValue: e.target.value })} />
                </div>
              )}
            </div>
          )}

          {test.type === 'jsonField' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label className="text-muted text-xs w-28">JSON path</label>
                <input className="flex-1 px-2 py-1 text-xs font-mono" placeholder="data.id" value={test.jsonPath ?? ''} onChange={(e) => update(test.id, { jsonPath: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-muted text-xs w-28">Operator</label>
                <select className="text-xs px-2 py-1" value={test.operator ?? 'exists'} onChange={(e) => update(test.id, { operator: e.target.value as TestAssertion['operator'] })}>
                  <option value="exists">exists</option>
                  <option value="notEmpty">not empty</option>
                  <option value="equals">equals</option>
                  <option value="contains">contains</option>
                </select>
                {(test.operator === 'equals' || test.operator === 'contains') && (
                  <input className="flex-1 px-2 py-1 text-xs" placeholder="expected value" value={test.expectedValue ?? ''} onChange={(e) => update(test.id, { expectedValue: e.target.value })} />
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add test */}
      <div className="flex flex-wrap gap-1">
        {TEST_TYPES.map((t) => (
          <button key={t.id} className="btn btn-ghost text-xs" onClick={() => addTest(t.id)}>+ {t.label}</button>
        ))}
      </div>

      {/* Database assertions */}
      <div className="border-t border-border mt-2 pt-2">
        <DatabaseAssertions
          assertions={dbAssertions ?? []}
          onChange={onDbAssertionsChange ?? (() => {})}
          response={response ?? null}
        />
      </div>
    </div>
  )
}
