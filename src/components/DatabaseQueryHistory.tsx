/**
 * DatabaseQueryHistory.tsx
 *
 * Shows execution history of database queries.
 * Allows re-opening and re-running past queries.
 */
import React from 'react'
import { useDbStore } from '../store/dbStore'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function DatabaseQueryHistory() {
  const { queryHistory, clearQueryHistory, setActiveSql, setActiveConnection, setDbView } = useDbStore()

  const reopen = (id: string) => {
    const entry = queryHistory.find((e) => e.id === id)
    if (!entry) return
    setActiveSql(entry.sql)
    setActiveConnection(entry.connectionId)
    setDbView('query-editor')
  }

  return (
    <div className="flex flex-col gap-3 p-4 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Query History</h2>
        {queryHistory.length > 0 && (
          <button className="btn btn-ghost text-xs text-danger" onClick={clearQueryHistory}>Clear</button>
        )}
      </div>

      {queryHistory.length === 0 && (
        <div className="text-center text-muted text-xs py-16">No query history yet.</div>
      )}

      <div className="flex flex-col gap-1">
        {queryHistory.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-2 px-3 py-2 rounded border border-border hover:border-accent/40 hover:bg-surface cursor-pointer text-xs group"
            onClick={() => reopen(entry.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-text truncate">{entry.queryName}</div>
              <div className="text-muted text-[10px] truncate font-mono">{entry.connectionName} · {formatTime(entry.timestamp)}</div>
              {entry.error && <div className="text-danger text-[10px] truncate">✗ {entry.error}</div>}
            </div>
            <div className="flex gap-2 text-muted">
              <span>{entry.rowCount} row{entry.rowCount !== 1 ? 's' : ''}</span>
              <span>{entry.executionTime} ms</span>
            </div>
            <button
              className="btn btn-ghost text-xs py-0.5 px-2 opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); reopen(entry.id) }}
            >▶ Rerun</button>
          </div>
        ))}
      </div>
    </div>
  )
}
