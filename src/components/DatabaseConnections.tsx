import React, { useState } from 'react'
import { useDbStore } from '../store/dbStore'
import type { DbConnection, DbType } from '../types'
import { newDbConnection } from '../types'

const DB_TYPES: { value: DbType; label: string; defaultPort: number }[] = [
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432 },
  { value: 'mysql', label: 'MySQL', defaultPort: 3306 },
  { value: 'oracle', label: 'Oracle', defaultPort: 1521 },
  { value: 'mssql', label: 'Microsoft SQL Server', defaultPort: 1433 },
  { value: 'sqlite', label: 'SQLite (file path)', defaultPort: 0 },
]

function ConnectionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: DbConnection
  onSave: (c: DbConnection) => void
  onCancel: () => void
}) {
  const [conn, setConn] = useState<DbConnection>(initial)
  const [showPwd, setShowPwd] = useState(false)
  const { testDbConnection, testingConnectionId, lastTestedConnectionId, testResult } = useDbStore()

  const set = (patch: Partial<DbConnection>) => setConn((c) => ({ ...c, ...patch }))

  const isSqlite = conn.dbType === 'sqlite'
  const isTesting = testingConnectionId === conn.id

  return (
    <div className="flex flex-col gap-3 p-4 bg-surface rounded-lg border border-border text-xs">
      <div className="text-sm font-semibold text-text mb-1">
        {initial.name === 'New Connection' ? 'New Database Connection' : `Edit: ${initial.name}`}
      </div>

      {/* Connection Name */}
      <label className="flex flex-col gap-1">
        <span className="text-muted">Connection Name *</span>
        <input className="px-2 py-1.5" value={conn.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. QA Database" />
      </label>

      {/* DB Type */}
      <label className="flex flex-col gap-1">
        <span className="text-muted">Database Type *</span>
        <select
          className="px-2 py-1.5"
          value={conn.dbType}
          onChange={(e) => {
            const t = e.target.value as DbType
            const def = DB_TYPES.find((d) => d.value === t)
            set({ dbType: t, port: def?.defaultPort ?? conn.port })
          }}
        >
          {DB_TYPES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </label>

      {!isSqlite && (
        <>
          {/* Host + Port */}
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-muted">Host *</span>
              <input className="px-2 py-1.5" value={conn.host} onChange={(e) => set({ host: e.target.value })} placeholder="localhost" />
            </label>
            <label className="flex flex-col gap-1 w-24">
              <span className="text-muted">Port *</span>
              <input className="px-2 py-1.5" type="number" value={conn.port} onChange={(e) => set({ port: Number(e.target.value) })} />
            </label>
          </div>

          {/* Database / Service Name */}
          <label className="flex flex-col gap-1">
            <span className="text-muted">{conn.dbType === 'oracle' ? 'Service Name *' : 'Database Name *'}</span>
            <input className="px-2 py-1.5" value={conn.database} onChange={(e) => set({ database: e.target.value })} placeholder={conn.dbType === 'oracle' ? 'ORCLCDB' : 'mydb'} />
          </label>

          {/* Username + Password */}
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-muted">Username</span>
              <input className="px-2 py-1.5" value={conn.username} onChange={(e) => set({ username: e.target.value })} placeholder="db_user" />
            </label>
            <label className="flex flex-col gap-1 flex-1 relative">
              <span className="text-muted">Password</span>
              <div className="flex gap-1">
                <input
                  className="px-2 py-1.5 flex-1"
                  type={showPwd ? 'text' : 'password'}
                  value={conn.password}
                  onChange={(e) => set({ password: e.target.value })}
                  placeholder="••••••••"
                />
                <button className="btn btn-ghost text-xs px-2" onClick={() => setShowPwd((v) => !v)} title="Toggle password visibility">
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
            </label>
          </div>

          {/* Schema */}
          <label className="flex flex-col gap-1">
            <span className="text-muted">Schema (optional)</span>
            <input className="px-2 py-1.5" value={conn.schema ?? ''} onChange={(e) => set({ schema: e.target.value })} placeholder="public" />
          </label>
        </>
      )}

      {isSqlite && (
        <label className="flex flex-col gap-1">
          <span className="text-muted">Database File Path *</span>
          <input className="px-2 py-1.5 font-mono" value={conn.database} onChange={(e) => set({ database: e.target.value })} placeholder="/path/to/database.db" />
        </label>
      )}

      {/* Test result — only show on the connection that was actually tested */}
      {testResult && lastTestedConnectionId === conn.id && testingConnectionId !== conn.id && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded text-xs ${testResult.success ? 'bg-success/10 text-success border border-success/30' : 'bg-danger/10 text-danger border border-danger/30'}`}>
          {testResult.success ? '✓' : '✗'} {testResult.message}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2 mt-1">
        <button
          className="btn btn-ghost text-xs"
          onClick={() => testDbConnection(conn)}
          disabled={isTesting}
        >
          {isTesting ? '⏳ Testing…' : '🔌 Test Connection'}
        </button>
        <button className="btn btn-primary text-xs" onClick={() => onSave(conn)}>💾 Save Connection</button>
        <button className="btn btn-ghost text-xs text-muted" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function DatabaseConnections() {
  const {
    connections, saveConnection, deleteConnection,
    setDbView, setActiveConnection, activeConnectionId,
    backendOnline,
  } = useDbStore()

  const [editing, setEditing] = useState<DbConnection | null>(null)

  const handleNew = () => {
    const c = newDbConnection()
    setEditing(c)
  }

  const handleEdit = (c: DbConnection) => setEditing({ ...c })

  const handleSave = (c: DbConnection) => {
    saveConnection(c)
    setEditing(null)
  }

  const handleSelect = (id: string) => {
    setActiveConnection(id)
    setDbView('query-editor')
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Database Connections</h2>
          <p className="text-muted text-xs mt-0.5">Manage your database connections. Credentials are stored locally and sent only to the backend proxy.</p>
        </div>
        <button className="btn btn-primary text-xs" onClick={handleNew}>+ New Connection</button>
      </div>

      {/* Backend status */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded text-xs border ${backendOnline ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'}`}>
        <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-success' : 'bg-warning'}`} />
        {backendOnline
          ? 'Backend server is running. Database operations are available.'
          : 'Backend server is offline. Start it: cd API/server && npm install && npm start'}
      </div>

      {/* Inline form */}
      {editing && (
        <ConnectionForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Connection list */}
      {connections.length === 0 && !editing && (
        <div className="text-center text-muted text-xs py-16">
          No connections yet.<br />Click <strong>+ New Connection</strong> to add your first database.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {connections.map((c) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded border cursor-pointer group ${activeConnectionId === c.id ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/40'}`}
            onClick={() => handleSelect(c.id)}
          >
            <span className="text-lg">
              {c.dbType === 'postgresql' ? '🐘' : c.dbType === 'mysql' ? '🐬' : c.dbType === 'oracle' ? '🔶' : c.dbType === 'mssql' ? '🪟' : '📁'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-text truncate">{c.name}</div>
              <div className="text-[10px] text-muted truncate font-mono">
                {c.dbType === 'sqlite' ? c.database : `${c.host}:${c.port}/${c.database}`}
                {c.username ? ` · ${c.username}` : ''}
                {c.schema ? ` · schema: ${c.schema}` : ''}
              </div>
            </div>
            <span className="text-[10px] text-muted px-1.5 py-0.5 rounded bg-surface border border-border capitalize">{c.dbType}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
              <button
                className="btn btn-ghost text-xs px-2 py-1"
                onClick={(e) => { e.stopPropagation(); handleEdit(c) }}
              >✏️</button>
              <button
                className="btn btn-ghost text-xs px-2 py-1 text-danger"
                onClick={(e) => { e.stopPropagation(); deleteConnection(c.id) }}
              >🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
