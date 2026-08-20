import React from 'react'
import { useStore } from '../store'

function MethodBadge({ method }: { method: string }) {
  return <span className={`text-xs font-bold method-${method} w-16 inline-block`}>{method}</span>
}

export default function Dashboard() {
  const {
    collections, requests, environments, history,
    setView, createCollection, openRequest, openBlankTab,
    setShowImport, setShowEnvManager, setSidebarTab,
  } = useStore()

  const recent = history.slice(0, 10)
  const totalRequests = requests.length
  const totalCollections = collections.length
  const totalEnvs = environments.length
  const totalHistory = history.length

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-bg">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text">API Testing Dashboard</h1>
            <p className="text-muted text-xs mt-1">Your API workspace at a glance</p>
          </div>
          <button className="btn btn-primary" onClick={openBlankTab}>+ New Request</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Collections', value: totalCollections, icon: '📁', color: 'text-accent' },
            { label: 'Saved Requests', value: totalRequests, icon: '📤', color: 'text-info' },
            { label: 'Environments', value: totalEnvs, icon: '🌍', color: 'text-success' },
            { label: 'History Entries', value: totalHistory, icon: '🕐', color: 'text-warning' },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-1">
              <div className="text-2xl">{stat.icon}</div>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-muted text-xs">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost text-xs" onClick={openBlankTab}>+ New Request</button>
            <button className="btn btn-ghost text-xs" onClick={() => { createCollection('New Collection'); setView('workspace') }}>+ New Collection</button>
            <button className="btn btn-ghost text-xs" onClick={() => setShowImport(true)}>⬆ Import APIs</button>
            <button className="btn btn-ghost text-xs" onClick={() => setShowEnvManager(true)}>🌍 Manage Environments</button>
          </div>
        </div>

        {/* Recent history */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">Recent Requests</h2>
          {recent.length === 0 && (
            <div className="text-muted text-xs text-center py-6">No requests made yet. Send your first request!</div>
          )}
          {recent.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-1 pr-4 w-20">Method</th>
                  <th className="text-left py-1 flex-1">URL</th>
                  <th className="text-left py-1 w-16">Status</th>
                  <th className="text-left py-1 w-20">Time</th>
                  <th className="text-left py-1 w-32">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-border/40 hover:bg-bg cursor-pointer"
                    onClick={() => { openRequest(entry.request.id); setView('workspace') }}
                  >
                    <td className="py-1.5 pr-4"><MethodBadge method={entry.request.method} /></td>
                    <td className="py-1.5 font-mono truncate max-w-xs text-text">{entry.request.url}</td>
                    <td className="py-1.5">
                      <span className={`font-bold ${entry.status >= 500 ? 'text-danger' : entry.status >= 400 ? 'text-warning' : entry.status >= 300 ? 'text-info' : 'text-success'}`}>
                        {entry.status || 'ERR'}
                      </span>
                    </td>
                    <td className="py-1.5 text-muted">{entry.responseTime}ms</td>
                    <td className="py-1.5 text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Collections overview */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-text mb-3">Collections</h2>
          {collections.length === 0 && (
            <div className="text-muted text-xs text-center py-6">
              No collections yet. <button className="text-accent underline" onClick={() => createCollection('My API Project')}>Create one</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {collections.map((col) => {
              const colRequests = requests.filter((r) => r.collectionId === col.id)
              return (
                <div
                  key={col.id}
                  className="border border-border rounded p-3 hover:bg-bg cursor-pointer"
                  onClick={() => { setSidebarTab('collections'); setView('workspace') }}
                >
                  <div className="text-text text-xs font-semibold">📁 {col.name}</div>
                  <div className="text-muted text-xs mt-1">{colRequests.length} requests</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
