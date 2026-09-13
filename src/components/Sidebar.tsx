import React, { useState } from 'react'
import { useStore } from '../store'
import { useDbStore } from '../store/dbStore'
import { useTdStore } from '../store/testDataStore'
import type { Collection, ApiRequest, Folder } from '../types'
import type { AppState } from '../store'

interface Props {
  searchQuery: string
}

function MethodBadge({ method }: { method: string }) {
  return <span className={`text-[10px] font-bold method-${method} w-14 flex-shrink-0`}>{method}</span>
}

function RequestItem({ req, folderId }: { req: ApiRequest; folderId?: string }) {
  const { openRequest, duplicateRequest, deleteRequest, activeRequest } = useStore()
  const [menu, setMenu] = useState(false)
  const isActive = activeRequest?.id === req.id

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 cursor-pointer rounded text-xs group relative ${isActive ? 'bg-accent/20 text-white' : 'hover:bg-surface'}`}
      onClick={() => openRequest(req.id)}
    >
      <MethodBadge method={req.method} />
      <span className="truncate flex-1 text-text">{req.name}</span>
      <button
        className="opacity-0 group-hover:opacity-100 text-muted hover:text-text px-1"
        onClick={(e) => { e.stopPropagation(); setMenu(!menu) }}
      >⋮</button>
      {menu && (
        <div
          className="absolute right-0 top-6 z-50 bg-surface border border-border rounded shadow-lg text-xs min-w-[140px]"
          onMouseLeave={() => setMenu(false)}
        >
          <button className="w-full text-left px-3 py-2 hover:bg-border" onClick={(e) => { e.stopPropagation(); openRequest(req.id); setMenu(false) }}>Open</button>
          <button className="w-full text-left px-3 py-2 hover:bg-border" onClick={(e) => { e.stopPropagation(); duplicateRequest(req.id); setMenu(false) }}>Duplicate</button>
          <button className="w-full text-left px-3 py-2 hover:bg-border text-danger" onClick={(e) => { e.stopPropagation(); deleteRequest(req.id); setMenu(false) }}>Delete</button>
        </div>
      )}
    </div>
  )
}

function FolderItem({ folder, requests }: { folder: Folder; requests: ApiRequest[] }) {
  const [expanded, setExpanded] = useState(true)
  const { createRequest } = useStore()
  const folderReqs = requests.filter((r) => r.folderId === folder.id)
  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-surface rounded text-xs group"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted">{expanded ? '▾' : '▸'}</span>
        <span className="text-text flex-1 truncate">📁 {folder.name}</span>
        <button
          className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent text-xs px-1"
          onClick={(e) => { e.stopPropagation(); createRequest(folder.collectionId, folder.id) }}
          title="Add request to folder"
        >+</button>
      </div>
      {expanded && (
        <div className="pl-4">
          {folderReqs.map((r) => <RequestItem key={r.id} req={r} />)}
        </div>
      )}
    </div>
  )
}

function CollectionItem({ col }: { col: Collection }) {
  const { requests, folders, createRequest, createFolder, deleteCollection, renameCollection } = useStore()
  const [expanded, setExpanded] = useState(true)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(col.name)

  const colFolders = folders.filter((f) => f.collectionId === col.id && !f.parentFolderId)
  const rootRequests = requests.filter((r) => r.collectionId === col.id && !r.folderId)

  return (
    <div className="mb-1">
      <div
        className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-surface rounded group"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted text-xs">{expanded ? '▾' : '▸'}</span>
        {renaming ? (
          <input
            className="flex-1 text-xs px-1"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => { renameCollection(col.id, newName); setRenaming(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { renameCollection(col.id, newName); setRenaming(false) } }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-xs font-semibold text-text truncate">{col.name}</span>
        )}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
          <button className="text-muted hover:text-accent text-xs px-1" onClick={(e) => { e.stopPropagation(); createRequest(col.id) }} title="Add request">+</button>
          <button className="text-muted hover:text-text text-xs px-1" onClick={(e) => { e.stopPropagation(); setMenu(!menu) }}>⋮</button>
        </div>
        {menu && (
          <div
            className="absolute right-2 z-50 bg-surface border border-border rounded shadow-lg text-xs min-w-[160px]"
            onMouseLeave={() => setMenu(false)}
          >
            <button className="w-full text-left px-3 py-2 hover:bg-border" onClick={(e) => { e.stopPropagation(); createRequest(col.id); setMenu(false) }}>Add Request</button>
            <button className="w-full text-left px-3 py-2 hover:bg-border" onClick={(e) => { e.stopPropagation(); createFolder(col.id, 'New Folder'); setMenu(false) }}>Add Folder</button>
            <button className="w-full text-left px-3 py-2 hover:bg-border" onClick={(e) => { e.stopPropagation(); setRenaming(true); setMenu(false) }}>Rename</button>
            <button className="w-full text-left px-3 py-2 hover:bg-border text-danger" onClick={(e) => { e.stopPropagation(); deleteCollection(col.id); setMenu(false) }}>Delete</button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="pl-2">
          {colFolders.map((f) => (
            <FolderItem key={f.id} folder={f} requests={requests} />
          ))}
          {rootRequests.map((r) => <RequestItem key={r.id} req={r} />)}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ searchQuery }: Props) {
  const {
    collections, requests, history, environments, activeEnvId,
    sidebarTab, setSidebarTab,
    createCollection, openRequest, openHistoryRequest, clearHistory,
    setShowEnvManager, setActiveEnv,
    openBlankTab,
    setView,
  } = useStore()
  // Set of request IDs that still exist, used to disable stale history rows.
  const existingRequestIds = new Set(requests.map((r) => r.id))

  const { connections, savedQueries, setDbView, dbView } = useDbStore()
  const { files: tdFiles, activeFileId: tdActiveFileId, setActiveFile: tdSetActiveFile, createFile: tdCreateFile } = useTdStore()

  const [newColName, setNewColName] = useState('')
  const [addingCol, setAddingCol] = useState(false)

  const filteredRequests = searchQuery
    ? requests.filter((r) => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.url.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  const activeEnv = environments.find((e) => e.id === activeEnvId) ?? null

  return (
    <div className="flex flex-col h-full">
      {/* Env selector */}
      <div className="px-2 py-2 border-b border-border flex items-center gap-2">
        <span className="text-muted text-xs">ENV:</span>
        <select
          className="flex-1 text-xs px-1 py-0.5"
          value={activeEnvId ?? ''}
          onChange={(e) => setActiveEnv(e.target.value || null)}
        >
          <option value="">No Environment</option>
          {environments.map((env) => (
            <option key={env.id} value={env.id}>{env.name}</option>
          ))}
        </select>
        <button className="text-muted hover:text-accent text-xs" onClick={() => setShowEnvManager(true)} title="Manage environments">⚙</button>
      </div>

      {/* Sidebar tabs */}
      <div className="flex border-b border-border text-xs">
        <button
          className={`flex-1 py-2 ${sidebarTab === 'collections' ? 'tab-active text-text' : 'text-muted hover:text-text'}`}
          onClick={() => setSidebarTab('collections')}
          title="Collections"
        >📁</button>
        <button
          className={`flex-1 py-2 ${sidebarTab === 'history' ? 'tab-active text-text' : 'text-muted hover:text-text'}`}
          onClick={() => setSidebarTab('history')}
          title="History"
        >🕐</button>
        <button
          className={`flex-1 py-2 ${sidebarTab === 'environments' ? 'tab-active text-text' : 'text-muted hover:text-text'}`}
          onClick={() => setSidebarTab('environments')}
          title="Environments"
        >🌍</button>
        <button
          className={`flex-1 py-2 ${sidebarTab === 'db-connections' ? 'tab-active text-text' : 'text-muted hover:text-text'}`}
          onClick={() => setSidebarTab('db-connections')}
          title="Database Connections"
        >🗄</button>
        <button
          className={`flex-1 py-2 ${sidebarTab === 'testdata' ? 'tab-active text-text' : 'text-muted hover:text-text'}`}
          onClick={() => setSidebarTab('testdata')}
          title="Test Data Files"
        >🧪</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Search results */}
        {searchQuery && (
          <div className="p-2">
            <div className="text-muted text-xs mb-2">Search Results ({filteredRequests.length})</div>
            {filteredRequests.map((r) => <RequestItem key={r.id} req={r} />)}
          </div>
        )}

        {/* Collections tab */}
        {!searchQuery && sidebarTab === 'collections' && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted text-xs uppercase tracking-wide">Collections</span>
              <button className="btn btn-ghost text-xs py-0.5 px-1.5" onClick={() => setAddingCol(true)}>+ New</button>
            </div>
            {addingCol && (
              <div className="flex gap-1 mb-2">
                <input
                  autoFocus
                  className="flex-1 text-xs px-2 py-1"
                  placeholder="Collection name"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newColName.trim()) { createCollection(newColName.trim()); setNewColName(''); setAddingCol(false) }
                    if (e.key === 'Escape') setAddingCol(false)
                  }}
                />
                <button className="btn btn-primary text-xs" onClick={() => { if (newColName.trim()) { createCollection(newColName.trim()); setNewColName(''); setAddingCol(false) } }}>Create</button>
              </div>
            )}
            {collections.length === 0 && (
              <div className="text-muted text-xs text-center py-8">No collections yet.<br />Create one to get started.</div>
            )}
            {collections.map((col) => <CollectionItem key={col.id} col={col} />)}
            <button
              className="btn btn-ghost text-xs w-full mt-2"
              onClick={() => openBlankTab()}
            >+ Quick Request</button>
          </div>
        )}

        {/* Environments tab */}
        {!searchQuery && sidebarTab === 'environments' && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted text-xs uppercase tracking-wide">Environments</span>
              <button className="btn btn-ghost text-xs py-0.5 px-1.5" onClick={() => setShowEnvManager(true)}>Manage</button>
            </div>
            {environments.length === 0 && (
              <div className="text-muted text-xs text-center py-8">No environments.<br />Click Manage to create one.</div>
            )}
            {environments.map((env) => (
              <div
                key={env.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer ${activeEnvId === env.id ? 'bg-accent/20 text-white' : 'hover:bg-surface'}`}
                onClick={() => setActiveEnv(env.id === activeEnvId ? null : env.id)}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activeEnvId === env.id ? 'bg-success' : 'bg-muted'}`} />
                <span className="flex-1 truncate">{env.name}</span>
                <span className="text-muted">{env.variables.length} vars</span>
              </div>
            ))}
          </div>
        )}

        {/* History tab */}
        {!searchQuery && sidebarTab === 'history' && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted text-xs uppercase tracking-wide">History</span>
              <button className="btn btn-ghost text-xs py-0.5 px-1.5 text-danger" onClick={clearHistory}>Clear</button>
            </div>
            {history.length === 0 && (
              <div className="text-muted text-xs text-center py-8">No history yet.</div>
            )}
            {history.slice(0, 100).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer hover:bg-surface"
                onClick={() => openHistoryRequest(entry.request as import('../types').ApiRequest)}
                title={`${entry.request.method} ${entry.request.url}`}
              >
                <MethodBadge method={entry.request.method} />
                <span className={`flex-shrink-0 text-[10px] font-bold ${entry.status >= 500 ? 'text-danger' : entry.status >= 400 ? 'text-warning' : entry.status >= 300 ? 'text-info' : 'text-success'}`}>
                  {entry.status || 'ERR'}
                </span>
                <span className="flex-1 truncate text-muted">{entry.request.url.replace(/https?:\/\/[^/]+/, '')}</span>
              </div>
            ))}
          </div>
        )}

        {/* DB Connections tab */}
        {!searchQuery && sidebarTab === 'db-connections' && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted text-xs uppercase tracking-wide">Database</span>
            </div>

            {/* Quick nav links */}
            <div className="flex flex-col gap-1 mb-3">
              <button
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${dbView === 'connections' ? 'bg-accent/20 text-white' : 'hover:bg-surface text-text'}`}
                onClick={() => setDbView('connections')}
              >
                🔌 <span>Connections</span>
                <span className="ml-auto text-muted text-[10px]">{connections.length}</span>
              </button>
              <button
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${dbView === 'query-editor' ? 'bg-accent/20 text-white' : 'hover:bg-surface text-text'}`}
                onClick={() => setDbView('query-editor')}
              >
                📝 <span>Query Editor</span>
              </button>
              <button
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${dbView === 'query-library' ? 'bg-accent/20 text-white' : 'hover:bg-surface text-text'}`}
                onClick={() => setDbView('query-library')}
              >
                📚 <span>Query Library</span>
                <span className="ml-auto text-muted text-[10px]">{savedQueries.length}</span>
              </button>
            </div>

            {connections.length === 0 && (
              <div className="text-muted text-xs text-center py-4">No DB connections.<br />Click Connections to add one.</div>
            )}

            {connections.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer hover:bg-surface text-text"
                onClick={() => { setDbView('connections') }}
              >
                <span>{c.dbType === 'postgresql' ? '🐘' : c.dbType === 'mysql' ? '🐬' : c.dbType === 'oracle' ? '🔶' : c.dbType === 'mssql' ? '🪟' : '📁'}</span>
                <span className="truncate flex-1">{c.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Test Data sidebar tab */}
        {!searchQuery && sidebarTab === 'testdata' && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted text-xs uppercase tracking-wide">Test Data Files</span>
              <button className="btn btn-ghost text-xs py-0.5 px-1.5" onClick={() => { tdCreateFile(); setView('testdata') }}>+ New</button>
            </div>
            {tdFiles.length === 0 && (
              <div className="text-muted text-xs text-center py-6">No test data files.<br />Click + to create one.</div>
            )}
            {tdFiles.map((file) => (
              <div
                key={file.id}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-pointer ${tdActiveFileId === file.id ? 'bg-accent/20 text-white' : 'hover:bg-surface text-text'}`}
                onClick={() => { tdSetActiveFile(file.id); setView('testdata') }}
              >
                <span>📋</span>
                <span className="flex-1 truncate">{file.name}</span>
                <span className="text-muted text-[10px]">{file.records.length}r</span>
              </div>
            ))}
            <button
              className="btn btn-ghost text-xs w-full mt-2"
              onClick={() => setView('testdata')}
            >Open Test Data →</button>
          </div>
        )}
      </div>
    </div>
  )
}
