import React, { useState, useCallback, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { useDbStore } from '../store/dbStore'
import type { DbQueryResult, DbExecutionMode } from '../types'

// ─── Format SQL (minimal) ─────────────────────────────────────────────────────
function formatSql(s: string): string {
  const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'FETCH']
  let result = s.trim()
  keywords.forEach((kw) => {
    result = result.replace(new RegExp(`\\b${kw}\\b`, 'gi'), `\n${kw}`)
  })
  return result.replace(/^\n/, '').replace(/\n{2,}/g, '\n')
}

// ─── Results table ────────────────────────────────────────────────────────────
function ResultsTable({ result, onRowSelect }: { result: DbQueryResult; onRowSelect: (idx: number) => void }) {
  const { selectedRowIndex, executionMode, setExecutionMode } = useDbStore()

  if (result.error) {
    return (
      <div className="p-3 rounded border border-danger/30 bg-danger/10 text-danger text-xs font-mono whitespace-pre-wrap">
        ✗ {result.error}
      </div>
    )
  }

  if (result.rows.length === 0) {
    return (
      <div className="p-3 text-muted text-xs">
        ⚠ Query returned no records. The API request cannot continue because required database variables are unavailable.
      </div>
    )
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'query_results.json'; a.click()
  }

  const exportCsv = () => {
    const header = result.columns.join(',')
    const rows = result.rows.map((r) => result.columns.map((c) => JSON.stringify(r[c] ?? '')).join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'query_results.csv'; a.click()
  }

  const copyAll = () => navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2))

  return (
    <div className="flex flex-col gap-2">
      {/* Stats + actions */}
      <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
        <span className="text-success">✓ Rows: {result.rowCount}</span>
        <span>Time: {result.executionTime} ms</span>
        <div className="flex gap-1 ml-auto">
          <button className="btn btn-ghost text-xs py-0.5 px-2" onClick={copyAll}>📋 Copy</button>
          <button className="btn btn-ghost text-xs py-0.5 px-2" onClick={exportJson}>⬇ JSON</button>
          <button className="btn btn-ghost text-xs py-0.5 px-2" onClick={exportCsv}>⬇ CSV</button>
        </div>
      </div>

      {/* Execution mode selector */}
      <div className="flex items-center gap-4 text-xs bg-surface px-3 py-2 rounded border border-border">
        <span className="text-muted font-semibold">Execution Mode:</span>
        {(['first-row', 'selected-row', 'all-rows'] as DbExecutionMode[]).map((m) => (
          <label key={m} className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              name="execMode"
              checked={executionMode === m}
              onChange={() => setExecutionMode(m)}
              className="accent-accent"
            />
            <span className="text-text capitalize">{m.replace('-', ' ')}</span>
          </label>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-64 rounded border border-border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-surface sticky top-0">
              <th className="px-2 py-1.5 text-left text-muted border-b border-border w-8">#</th>
              {result.columns.map((col) => (
                <th key={col} className="px-2 py-1.5 text-left text-muted border-b border-border whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, idx) => (
              <tr
                key={idx}
                className={`cursor-pointer ${selectedRowIndex === idx ? 'bg-accent/20' : 'hover:bg-surface'}`}
                onClick={() => onRowSelect(idx)}
              >
                <td className="px-2 py-1 border-b border-border/50 text-muted">{idx + 1}</td>
                {result.columns.map((col) => (
                  <td key={col} className="px-2 py-1 border-b border-border/50 font-mono whitespace-nowrap max-w-xs truncate" title={String(row[col] ?? '')}>
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DatabaseQueryEditor() {
  const {
    connections, savedQueries,
    activeConnectionId, setActiveConnection,
    activeQueryId, setActiveQuery,
    activeSql, setActiveSql,
    queryResult, isRunningQuery,
    runActiveQuery, clearQueryResult,
    setSelectedRowIndex,
    saveQuery, createQuery,
    dbVariables,
  } = useDbStore()

  const [sqlParams, setSqlParams] = useState<Record<string, string>>({})
  const [showVars, setShowVars] = useState(true)
  const [saveNameInput, setSaveNameInput] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  // Extract {{placeholder}} names from SQL for parameterized input.
  // Exclude {{db.XXX}} db-variable tokens — those are resolved at runtime,
  // not entered as manual parameters.
  // Fixed: previous regex `/\{\{([^db][A-Za-z0-9_]*)\}\}/g` used a character
  // class `[^db]` that excluded any name starting with 'd' or 'b', not just
  // the literal prefix "db.". The correct approach is a negative lookahead.
  const paramMatches = [...new Set(
    (activeSql.match(/\{\{(?!db\.)([A-Za-z0-9_]+)\}\}/g) ?? []).map((m) => m.slice(2, -2))
  )]

  // Use a ref so the callback always sees the current sqlParams without
  // needing to re-register the window listener on every keystroke.
  const sqlParamsRef = useRef(sqlParams)
  sqlParamsRef.current = sqlParams

  const handleRun = useCallback(() => {
    runActiveQuery(sqlParamsRef.current)
  }, [runActiveQuery])

  const handleFormat = () => setActiveSql(formatSql(activeSql))

  const handleSaveQuery = () => {
    if (!activeConnectionId) {
      setSaveNameInput('')
      setShowSaveInput(false)
      return
    }
    setShowSaveInput(true)
  }

  const commitSaveQuery = () => {
    const name = saveNameInput.trim()
    if (!name || !activeConnectionId) return
    const q = createQuery({ name, connectionId: activeConnectionId, sql: activeSql })
    saveQuery(q)
    setSaveNameInput('')
    setShowSaveInput(false)
  }

  const handleLoadQuery = (id: string) => {
    setActiveQuery(id)
  }

  const handleRowSelect = (idx: number) => setSelectedRowIndex(idx)

  const dbVarEntries = Object.entries(dbVariables)

  return (
    <div className="flex flex-col h-full gap-3 p-4 overflow-auto">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-text">SQL Query Editor</h2>
        <div className="flex-1" />

        {/* Connection selector */}
        <select
          className="text-xs px-2 py-1.5 max-w-[200px]"
          value={activeConnectionId ?? ''}
          onChange={(e) => setActiveConnection(e.target.value || null)}
        >
          <option value="">— Select Connection —</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Saved queries dropdown */}
        <select
          className="text-xs px-2 py-1.5 max-w-[200px]"
          value={activeQueryId ?? ''}
          onChange={(e) => handleLoadQuery(e.target.value)}
        >
          <option value="">— Load Saved Query —</option>
          {savedQueries.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
      </div>

      {/* Editor */}
      <div className="rounded border border-border overflow-hidden flex-shrink-0" style={{ minHeight: 180 }}>
        <CodeMirror
          value={activeSql}
          height="180px"
          extensions={[sql()]}
          theme={oneDark}
          onChange={setActiveSql}
        />
      </div>

      {/* SQL param inputs */}
      {paramMatches.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-surface rounded border border-border text-xs">
          <span className="text-muted font-semibold w-full">Query Parameters:</span>
          {paramMatches.map((p) => (
            <label key={p} className="flex items-center gap-2">
              <span className="text-accent font-mono">{`{{${p}}}`}</span>
              <input
                className="px-2 py-1 w-32"
                placeholder={p}
                value={sqlParams[p] ?? ''}
                onChange={(e) => setSqlParams((prev) => ({ ...prev, [p]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-shrink-0 flex-wrap">
        <button
          className="btn btn-primary text-xs"
          onClick={handleRun}
          disabled={isRunningQuery || !activeConnectionId}
          title={!activeConnectionId ? 'Select a connection first' : 'Run query (Ctrl+Enter)'}
        >
          {isRunningQuery ? '⏳ Running…' : '▶ Run Query'}
        </button>
        <button className="btn btn-ghost text-xs" onClick={handleFormat}>✨ Format SQL</button>
        <button
          className="btn btn-ghost text-xs"
          onClick={handleSaveQuery}
          disabled={!activeConnectionId}
          title={!activeConnectionId ? 'Select a connection first' : 'Save query'}
        >
          💾 Save Query
        </button>
        {queryResult && <button className="btn btn-ghost text-xs text-muted" onClick={clearQueryResult}>✕ Clear</button>}

        {dbVarEntries.length > 0 && (
          <button className="btn btn-ghost text-xs ml-auto" onClick={() => setShowVars((v) => !v)}>
            {showVars ? '▾' : '▸'} DB Variables ({dbVarEntries.length})
          </button>
        )}
      </div>

      {/* Inline save-query input — replaces browser prompt() */}
      {showSaveInput && (
        <div className="flex items-center gap-2 p-2 bg-surface rounded border border-border text-xs">
          <span className="text-muted">Query name:</span>
          <input
            autoFocus
            className="flex-1 px-2 py-1"
            placeholder="My Query"
            value={saveNameInput}
            onChange={(e) => setSaveNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSaveQuery()
              if (e.key === 'Escape') setShowSaveInput(false)
            }}
          />
          <button className="btn btn-primary text-xs" onClick={commitSaveQuery}>Save</button>
          <button className="btn btn-ghost text-xs" onClick={() => setShowSaveInput(false)}>Cancel</button>
        </div>
      )}

      {/* DB Variables panel */}
      {showVars && dbVarEntries.length > 0 && (
        <div className="p-3 bg-surface rounded border border-border text-xs">
          <div className="text-muted font-semibold mb-2">Available Variables (use as {'{{db.COLUMN}}'})</div>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
            {dbVarEntries.map(([col, val]) => (
              <React.Fragment key={col}>
                <button
                  className="text-accent font-mono text-left hover:text-text"
                  onClick={() => navigator.clipboard.writeText(`{{db.${col}}}`)}
                  title="Click to copy"
                >
                  {`{{db.${col}}}`}
                </button>
                <span className="text-muted font-mono truncate" title={String(val ?? '')}>= {String(val ?? '')}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Query results */}
      {queryResult && (
        <div className="flex-1">
          <ResultsTable result={queryResult} onRowSelect={handleRowSelect} />
        </div>
      )}
    </div>
  )
}
