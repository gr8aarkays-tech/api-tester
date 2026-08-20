import React, { useState } from 'react'
import { useDbStore } from '../store/dbStore'
import type { SavedQuery } from '../types'
import { newSavedQuery } from '../types'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'

function QueryForm({
  initial,
  connections,
  onSave,
  onCancel,
}: {
  initial: SavedQuery
  connections: { id: string; name: string }[]
  onSave: (q: SavedQuery) => void
  onCancel: () => void
}) {
  const [q, setQ] = useState<SavedQuery>(initial)
  const set = (patch: Partial<SavedQuery>) => setQ((prev) => ({ ...prev, ...patch }))

  return (
    <div className="flex flex-col gap-3 p-4 bg-surface rounded-lg border border-border text-xs">
      <div className="text-sm font-semibold text-text">{initial.name === 'New Query' ? 'New Saved Query' : `Edit: ${initial.name}`}</div>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-muted">Query Name *</span>
          <input className="px-2 py-1.5" value={q.name} onChange={(e) => set({ name: e.target.value })} placeholder="Get Active Customer" />
        </label>
        <label className="flex flex-col gap-1 w-24">
          <span className="text-muted">Category</span>
          <input className="px-2 py-1.5" value={q.category ?? ''} onChange={(e) => set({ category: e.target.value })} placeholder="Customer" />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-muted">Database Connection</span>
        <select className="px-2 py-1.5" value={q.connectionId} onChange={(e) => set({ connectionId: e.target.value })}>
          <option value="">— None —</option>
          {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted">Description</span>
        <input className="px-2 py-1.5" value={q.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="Fetches the first active customer" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted">SQL Query *</span>
        <div className="rounded border border-border overflow-hidden">
          <CodeMirror
            value={q.sql}
            height="140px"
            extensions={[sql()]}
            theme={oneDark}
            onChange={(val) => set({ sql: val })}
          />
        </div>
      </label>

      <div className="flex gap-2 mt-1">
        <button className="btn btn-primary text-xs" onClick={() => onSave(q)}>💾 Save</button>
        <button className="btn btn-ghost text-xs text-muted" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// Group queries by category
function groupByCategory(queries: SavedQuery[]): Record<string, SavedQuery[]> {
  return queries.reduce((acc, q) => {
    const cat = q.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(q)
    return acc
  }, {} as Record<string, SavedQuery[]>)
}

export default function QueryLibrary() {
  const { savedQueries, connections, saveQuery, deleteQuery, setActiveQuery, setDbView } = useDbStore()
  const [editing, setEditing] = useState<SavedQuery | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const grouped = groupByCategory(savedQueries)

  const handleNew = () => setEditing(newSavedQuery())
  const handleEdit = (q: SavedQuery) => setEditing({ ...q })

  const handleSave = (q: SavedQuery) => {
    saveQuery(q)
    setEditing(null)
  }

  const handleOpen = (q: SavedQuery) => {
    setActiveQuery(q.id)
    setDbView('query-editor')
  }

  const toggleCat = (cat: string) => setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }))

  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Query Library</h2>
          <p className="text-muted text-xs mt-0.5">Save and organize frequently used SQL queries.</p>
        </div>
        <button className="btn btn-primary text-xs" onClick={handleNew}>+ New Query</button>
      </div>

      {editing && (
        <QueryForm
          initial={editing}
          connections={connections}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {savedQueries.length === 0 && !editing && (
        <div className="text-center text-muted text-xs py-16">
          No saved queries yet.<br />Click <strong>+ New Query</strong> to save one.
        </div>
      )}

      {Object.entries(grouped).map(([cat, queries]) => {
        const isOpen = expanded[cat] !== false
        return (
          <div key={cat} className="rounded border border-border overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 bg-surface text-xs font-semibold text-text hover:bg-border"
              onClick={() => toggleCat(cat)}
            >
              <span className="text-muted">{isOpen ? '▾' : '▸'}</span>
              📂 {cat}
              <span className="text-muted ml-auto">{queries.length}</span>
            </button>
            {isOpen && (
              <div className="flex flex-col divide-y divide-border/50">
                {queries.map((q) => {
                  const conn = connections.find((c) => c.id === q.connectionId)
                  return (
                    <div key={q.id} className="flex items-center gap-2 px-3 py-2 hover:bg-surface group text-xs">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpen(q)}>
                        <div className="font-semibold text-text truncate">{q.name}</div>
                        <div className="text-muted truncate font-mono text-[10px]">
                          {conn?.name ?? 'No connection'} · {new Date(q.updatedAt).toLocaleDateString()}
                        </div>
                        {q.description && <div className="text-muted text-[10px] truncate">{q.description}</div>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => handleOpen(q)}>▶ Open</button>
                        <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => handleEdit(q)}>✏️</button>
                        <button className="btn btn-ghost text-xs px-2 py-1 text-danger" onClick={() => deleteQuery(q.id)}>🗑</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
