import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import RequestBuilder from './components/RequestBuilder'
import ResponseViewer from './components/ResponseViewer'
import Dashboard from './components/Dashboard'
import EnvironmentManager from './components/EnvironmentManager'
import CodeGenerator from './components/CodeGenerator'
import ImportModal from './components/ImportModal'
import SettingsModal from './components/SettingsModal'
import DatabaseConnections from './components/DatabaseConnections'
import DatabaseQueryEditor from './components/DatabaseQueryEditor'
import QueryLibrary from './components/QueryLibrary'
import DatabaseQueryHistory from './components/DatabaseQueryHistory'
import WorkflowBuilder from './components/WorkflowBuilder'
import TestDataGenerator from './components/TestDataGenerator'
import { useDbStore } from './store/dbStore'
import type { DbState } from './store/dbStore'
import { pingBackend } from './services/dbClient'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 400

export default function App() {
  const {
    tabs, activeTabId, setActiveTab, closeTab,
    view, setView,
    showEnvManager, showCodeGen, showImport, showSettings,
    openBlankTab, saveActiveRequest,
    setShowImport, setShowSettings,
    searchOpen, setSearchOpen, searchQuery, setSearchQuery,
  } = useStore()

  const { dbView, setBackendOnline } = useDbStore()

  // Ping backend on mount and every 30s
  useEffect(() => {
    const check = () => pingBackend().then(setBackendOnline)
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [])

  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [splitRatio, setSplitRatio] = useState(0.45) // request/response split
  const draggingSidebar = useRef(false)
  const draggingSplit = useRef(false)
  const mainRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); saveActiveRequest() }
        if (e.key === 'n') { e.preventDefault(); openBlankTab() }
        if (e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
        if (e.key === '/') { e.preventDefault(); setSidebarVisible((v) => !v) }
        if (e.key === 'Enter') { /* handled in RequestBuilder */ }
      }
      if (e.key === 'Escape') { setSearchOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Sidebar drag
  const onSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingSidebar.current = true
    const onMove = (ev: MouseEvent) => {
      if (!draggingSidebar.current) return
      const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, ev.clientX))
      setSidebarWidth(w)
    }
    const onUp = () => { draggingSidebar.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Panel split drag
  const onSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingSplit.current = true
    const onMove = (ev: MouseEvent) => {
      if (!mainRef.current || !draggingSplit.current) return
      const rect = mainRef.current.getBoundingClientRect()
      const ratio = Math.max(0.2, Math.min(0.8, (ev.clientY - rect.top) / rect.height))
      setSplitRatio(ratio)
    }
    const onUp = () => { draggingSplit.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg text-text">
      {/* Top nav */}
      <header className="flex items-center gap-0 px-3 py-1.5 border-b border-border bg-surface flex-shrink-0 h-10">
        <button
          className="text-muted hover:text-text px-2 py-1 rounded text-xs mr-2"
          onClick={() => setSidebarVisible((v) => !v)}
          title="Toggle Sidebar (Ctrl+/)"
        >☰</button>

        <button
          className={`px-3 py-1 rounded text-xs mr-1 ${view === 'dashboard' ? 'text-text bg-bg' : 'text-muted hover:text-text'}`}
          onClick={() => setView('dashboard')}
        >
          🏠 Dashboard
        </button>
        <button
          className={`px-3 py-1 rounded text-xs mr-1 ${view === 'workspace' ? 'text-text bg-bg' : 'text-muted hover:text-text'}`}
          onClick={() => setView('workspace')}
        >
          ⚡ Workspace
        </button>
        <button
          className={`px-3 py-1 rounded text-xs mr-1 ${view === 'db' ? 'text-text bg-bg' : 'text-muted hover:text-text'}`}
          onClick={() => setView('db')}
        >
          🗄 Database
        </button>
        <button
          className={`px-3 py-1 rounded text-xs mr-3 ${view === 'testdata' ? 'text-text bg-bg' : 'text-muted hover:text-text'}`}
          onClick={() => setView('testdata')}
        >
          🧪 Test Data
        </button>

        {/* Request tabs */}
        <div className="flex-1 flex items-center gap-0 overflow-x-auto min-w-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs cursor-pointer whitespace-nowrap group ${activeTabId === tab.id ? 'bg-bg text-text' : 'text-muted hover:text-text hover:bg-bg/50'}`}
              onClick={() => { setActiveTab(tab.id); setView('workspace') }}
            >
              <span className={`${tab.isDirty ? 'text-warning' : ''}`}>{tab.title || 'Untitled'}</span>
              {tab.isDirty && <span className="text-warning text-[10px]">●</span>}
              <button
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger text-[10px] ml-1"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              >✕</button>
            </div>
          ))}
          <button className="text-muted hover:text-accent px-2 py-1 text-xs" onClick={openBlankTab} title="New Request (Ctrl+N)">+</button>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 ml-2">
          <button className="btn btn-ghost text-xs" onClick={() => setSearchOpen(true)} title="Search (Ctrl+K)">🔍</button>
          <button className="btn btn-ghost text-xs" onClick={() => setShowImport(true)}>⬆ Import</button>
          <button className="btn btn-ghost text-xs" onClick={() => setShowSettings(true)}>⚙</button>
        </div>
      </header>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-start justify-center pt-20" onClick={() => setSearchOpen(false)}>
          <div className="bg-surface border border-border rounded-lg shadow-2xl w-[480px]" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              className="w-full px-4 py-3 text-sm bg-transparent border-none outline-none"
              placeholder="Search requests, collections, URLs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false) }}
            />
            <div className="border-t border-border px-4 py-2 text-muted text-xs">
              {searchQuery ? 'Results shown in sidebar' : 'Type to search across all requests and collections'}
            </div>
          </div>
        </div>
      )}

      {/* Main body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarVisible && (
          <div style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }} className="flex flex-col border-r border-border bg-surface overflow-hidden flex-shrink-0">
            <Sidebar searchQuery={searchQuery} />
          </div>
        )}

        {/* Sidebar drag handle */}
        {sidebarVisible && (
          <div className="splitter-v flex-shrink-0" onMouseDown={onSidebarMouseDown} />
        )}

        {/* Main area */}
        {view === 'dashboard' && <Dashboard />}

        {view === 'workspace' && (
          <div ref={mainRef} className="flex-1 flex flex-col overflow-hidden">
            {/* Request panel */}
            <div style={{ height: `${splitRatio * 100}%`, minHeight: '120px' }} className="overflow-hidden flex-shrink-0">
              <RequestBuilder />
            </div>

            {/* Drag handle */}
            <div className="splitter flex-shrink-0" onMouseDown={onSplitMouseDown} />

            {/* Response panel */}
            <div className="flex-1 overflow-hidden min-h-20">
              <ResponseViewer />
            </div>
          </div>
        )}

        {/* Database view */}
        {view === 'db' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* DB sub-navigation */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-surface flex-shrink-0 text-xs">
              {([
                { id: 'connections', label: '🔌 Connections' },
                { id: 'query-editor', label: '📝 Query Editor' },
                { id: 'query-library', label: '📚 Query Library' },
                { id: 'query-history', label: '🕐 History' },
                { id: 'workflow', label: '🔗 Workflow' },
              ] as { id: DbState['dbView']; label: string }[]).map((item) => (
                <button
                  key={item.id}
                  className={`px-3 py-1 rounded ${dbView === item.id ? 'bg-bg text-text' : 'text-muted hover:text-text'}`}
                  onClick={() => useDbStore.getState().setDbView(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden">
              {dbView === 'connections' && <DatabaseConnections />}
              {dbView === 'query-editor' && <DatabaseQueryEditor />}
              {dbView === 'query-library' && <QueryLibrary />}
              {dbView === 'query-history' && <DatabaseQueryHistory />}
              {dbView === 'workflow' && <WorkflowBuilder />}
            </div>
          </div>
        )}

        {/* Test Data Generator view */}
        {view === 'testdata' && (
          <div className="flex-1 overflow-hidden">
            <TestDataGenerator />
          </div>
        )}
      </div>

      {/* Modals */}
      {showEnvManager && <EnvironmentManager />}
      {showCodeGen && <CodeGenerator />}
      {showImport && <ImportModal />}
      {showSettings && <SettingsModal />}
    </div>
  )
}
