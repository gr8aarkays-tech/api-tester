/**
 * DatabaseTab.tsx
 *
 * The "Database" tab inside the RequestBuilder.
 * Allows the user to:
 *  - Pick a connection and saved query
 *  - Run the query and see variables
 *  - Insert {{db.COLUMN}} variables into the active request
 *  - Configure data mode and execution mode
 */
import React, { useState, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { useDbStore } from '../store/dbStore'
import { useStore } from '../store'
import type { DbDataMode, DbExecutionMode } from '../types'
import { resolveDbVars } from '../services/dbClient'

function InsertableVar({ name, onInsert }: { name: string; onInsert: (v: string) => void }) {
  return (
    <button
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 text-accent text-[11px] font-mono hover:bg-accent/20 active:scale-95 transition-transform"
      onClick={() => onInsert(`{{db.${name}}}`)}
      title={`Click to copy {{db.${name}}}`}
    >
      {`{{db.${name}}}`}
    </button>
  )
}

export default function DatabaseTab() {
  const {
    connections, savedQueries,
    activeConnectionId, setActiveConnection,
    activeQueryId, setActiveQuery,
    activeSql, setActiveSql,
    queryResult, isRunningQuery, runActiveQuery,
    dbVariables,
    executionMode, setExecutionMode,
    selectedRowIndex, setSelectedRowIndex,
  } = useDbStore()

  const { activeRequest, updateActiveRequest } = useStore()
  const [dataMode, setDataMode] = useState<DbDataMode>('manual')
  const [showPreview, setShowPreview] = useState(false)

  const dbVarEntries = Object.entries(dbVariables)

  // Determine the target field the user last clicked in (simple clipboard-based)
  const insertVar = useCallback((varStr: string) => {
    navigator.clipboard.writeText(varStr)
  }, [])

  // Resolve preview
  const resolvedUrl = activeRequest ? resolveDbVars(activeRequest.url, dbVariables) : ''
  const resolvedBody = activeRequest ? resolveDbVars(activeRequest.bodyJson, dbVariables) : ''

  const hasUnresolved = activeRequest && (
    activeRequest.url.includes('{{db.') ||
    activeRequest.bodyJson.includes('{{db.') ||
    activeRequest.headers.some((h) => h.value.includes('{{db.'))
  )

  return (
    <div className="flex flex-col gap-4 p-3 text-xs overflow-auto h-full">
      {/* Connection + Query selectors */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Database Connection</span>
          <select
            className="px-2 py-1.5"
            value={activeConnectionId ?? ''}
            onChange={(e) => setActiveConnection(e.target.value || null)}
          >
            <option value="">— Select Connection —</option>
            {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted">Saved Query</span>
          <select
            className="px-2 py-1.5"
            value={activeQueryId ?? ''}
            onChange={(e) => setActiveQuery(e.target.value || '')}
          >
            <option value="">— Ad-hoc / Select Query —</option>
            {savedQueries.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        </label>
      </div>

      {/* SQL editor (compact) */}
      <div>
        <div className="text-muted mb-1">SQL Query</div>
        <div className="rounded border border-border overflow-hidden">
          <CodeMirror
            value={activeSql}
            height="120px"
            extensions={[sql()]}
            theme={oneDark}
            onChange={setActiveSql}
          />
        </div>
      </div>

      {/* Execution controls */}
      <div className="flex flex-wrap gap-3 items-center p-2 bg-surface rounded border border-border">
        {/* Data Mode */}
        <div className="flex flex-col gap-1">
          <span className="text-muted">Database Data Mode</span>
          <select
            className="px-2 py-1 text-xs"
            value={dataMode}
            onChange={(e) => setDataMode(e.target.value as DbDataMode)}
          >
            <option value="manual">Manual</option>
            <option value="fetch-before">Fetch Before Request</option>
            <option value="fetch-once">Fetch Once Per Session</option>
            <option value="fetch-every">Fetch For Every Request</option>
            <option value="data-driven">Data Driven</option>
          </select>
        </div>

        {/* Execution Mode */}
        <div className="flex flex-col gap-1">
          <span className="text-muted">Row Selection</span>
          <div className="flex gap-3">
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
        </div>
      </div>

      {/* Run button */}
      <div className="flex gap-2">
        <button
          className="btn btn-primary text-xs"
          onClick={() => runActiveQuery()}
          disabled={isRunningQuery || !activeConnectionId}
          title={!activeConnectionId ? 'Select a connection first' : ''}
        >
          {isRunningQuery ? '⏳ Fetching…' : '▶ Run Query'}
        </button>
        {hasUnresolved && (
          <button
            className="btn btn-ghost text-xs"
            onClick={() => setShowPreview((v) => !v)}
          >
            👁 {showPreview ? 'Hide' : 'Show'} Resolved Request
          </button>
        )}
      </div>

      {/* Query result summary */}
      {queryResult && (
        <div className={`flex items-center gap-3 px-3 py-2 rounded border text-xs ${queryResult.error ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/10 text-success'}`}>
          {queryResult.error ? (
            <span>✗ {queryResult.error}</span>
          ) : (
            <>
              <span>✓ {queryResult.rowCount} row(s)</span>
              <span className="text-muted">{queryResult.executionTime} ms</span>
              {queryResult.rowCount > 1 && (
                <label className="flex items-center gap-1 ml-auto text-muted">
                  Selected row:
                  <input
                    type="number"
                    min={1}
                    max={queryResult.rowCount}
                    value={selectedRowIndex + 1}
                    onChange={(e) => setSelectedRowIndex(Number(e.target.value) - 1)}
                    className="w-12 px-1 py-0.5 ml-1"
                  />
                  / {queryResult.rowCount}
                </label>
              )}
            </>
          )}
        </div>
      )}

      {/* Available variables */}
      {dbVarEntries.length > 0 && (
        <div>
          <div className="text-muted mb-2 font-semibold">
            Available Variables — click to copy, then paste into URL / Body / Headers:
          </div>
          <div className="flex flex-wrap gap-2">
            {dbVarEntries.map(([col]) => (
              <InsertableVar key={col} name={col} onInsert={insertVar} />
            ))}
          </div>
          <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
            {dbVarEntries.map(([col, val]) => (
              <React.Fragment key={col}>
                <span className="text-muted font-mono">{`{{db.${col}}}`}</span>
                <span className="text-text font-mono truncate">= {String(val ?? '')}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {dbVarEntries.length === 0 && !isRunningQuery && (
        <div className="text-muted text-xs text-center py-4">
          Run a query to generate <code className="text-accent">{'{{db.COLUMN}}'}</code> variables.
        </div>
      )}

      {/* Resolved request preview */}
      {showPreview && activeRequest && (
        <div className="flex flex-col gap-2 p-3 bg-surface rounded border border-border">
          <div className="text-muted font-semibold">Request Data Preview</div>

          <div className="flex gap-4">
            <div className="flex-1">
              <div className="text-muted text-[10px] mb-1">TEMPLATE URL</div>
              <div className="font-mono text-xs text-text truncate">{activeRequest.url}</div>
            </div>
            <div className="flex-1">
              <div className="text-muted text-[10px] mb-1">RESOLVED URL</div>
              <div className="font-mono text-xs text-success truncate">{resolvedUrl}</div>
            </div>
          </div>

          {activeRequest.bodyJson && activeRequest.bodyJson.includes('{{db.') && (
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="text-muted text-[10px] mb-1">TEMPLATE BODY</div>
                <pre className="text-xs font-mono text-text overflow-auto max-h-32 bg-bg p-2 rounded">{activeRequest.bodyJson}</pre>
              </div>
              <div className="flex-1">
                <div className="text-muted text-[10px] mb-1">RESOLVED BODY</div>
                <pre className="text-xs font-mono text-success overflow-auto max-h-32 bg-bg p-2 rounded">{resolvedBody}</pre>
              </div>
            </div>
          )}

          {/* DB values summary */}
          {dbVarEntries.length > 0 && (
            <div>
              <div className="text-muted text-[10px] mb-1">DATABASE VALUES</div>
              <div className="grid gap-0.5 font-mono text-xs" style={{ gridTemplateColumns: 'auto 1fr' }}>
                {dbVarEntries.map(([col, val]) => (
                  <React.Fragment key={col}>
                    <span className="text-muted pr-4">{col}</span>
                    <span className="text-text">= {String(val ?? '')}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
