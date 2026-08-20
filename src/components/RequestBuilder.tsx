import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '../store'
import type { HttpMethod, ApiType } from '../types'
import { executeRequest } from '../services/apiClient'
import { environmentService } from '../services/environmentService'
import { resolveDbVars } from '../services/dbClient'
import { useDbStore } from '../store/dbStore'
import { v4 as uuidv4 } from 'uuid'
import KeyValueEditor from './KeyValueEditor'
import AuthEditor from './AuthEditor'
import BodyEditor from './BodyEditor'
import TestEditor from './TestEditor'
import DatabaseTab from './DatabaseTab'

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-green-400', POST: 'text-blue-400', PUT: 'text-yellow-400',
  PATCH: 'text-orange-400', DELETE: 'text-red-400', HEAD: 'text-purple-400', OPTIONS: 'text-emerald-400',
}

type ReqTab = 'params' | 'auth' | 'headers' | 'body' | 'database' | 'tests' | 'settings'

const REQ_TABS: { id: ReqTab; label: string }[] = [
  { id: 'params', label: 'Params' },
  { id: 'auth', label: 'Authorization' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'database', label: 'Database' },
  { id: 'tests', label: 'Tests' },
  { id: 'settings', label: 'Settings' },
]

export default function RequestBuilder() {
  const {
    activeRequest, updateActiveRequest, saveActiveRequest,
    environments, activeEnvId,
    isLoading, setLoading, setResponse, response,
    addHistoryEntry, setShowCodeGen,
    duplicateRequest,
  } = useStore()

  const { dbVariables } = useDbStore()

  const [activeTab, setActiveTab] = useState<ReqTab>('params')
  const abortRef = useRef<AbortController | null>(null)
  // Keep a stable ref to handleSend so the keydown listener below doesn't
  // need to be re-registered every render.
  const handleSendRef = useRef<() => void>(() => {})

  const activeEnv = environments.find((e) => e.id === activeEnvId) ?? null

  if (!activeRequest) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
        <div className="text-4xl">🚀</div>
        <div className="text-sm">Select a request from the sidebar or create a new one</div>
        <button className="btn btn-primary text-sm" onClick={() => useStore.getState().openBlankTab()}>
          + New Request
        </button>
      </div>
    )
  }

  const resolvedUrl = environmentService.resolve(activeRequest.url, activeEnv)
  const enabledParams = activeRequest.params.filter((p) => p.enabled && p.key)
  // Encode params in the preview exactly as apiClient does, so what's shown
  // is what gets sent (e.g. spaces → %20 rather than a literal space).
  const finalUrl = enabledParams.length > 0
    ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}${enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')}`
    : resolvedUrl

  const handleSend = useCallback(async () => {
    if (isLoading) {
      // Abort the in-flight request; the finally block in the try below will
      // call setLoading(false) when the fetch resolves/rejects — don't do it
      // here to avoid a double-call race with a new request started immediately.
      abortRef.current?.abort()
      return
    }

    if (!activeRequest.url.trim()) return

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setResponse(null)

    try {
      // Resolve {{db.X}} variables before sending (all body types, not just JSON/raw)
      const resolvedRequest = {
        ...activeRequest,
        url: resolveDbVars(activeRequest.url, dbVariables),
        bodyJson: resolveDbVars(activeRequest.bodyJson, dbVariables),
        bodyXml: resolveDbVars(activeRequest.bodyXml, dbVariables),
        bodyRaw: resolveDbVars(activeRequest.bodyRaw, dbVariables),
        headers: activeRequest.headers.map((h) => ({ ...h, value: resolveDbVars(h.value, dbVariables) })),
        params: activeRequest.params.map((p) => ({ ...p, value: resolveDbVars(p.value, dbVariables) })),
      }
      const result = await executeRequest(resolvedRequest, activeEnv, controller.signal)
      setResponse(result)

      // save to history
      addHistoryEntry({
        id: uuidv4(),
        request: { ...activeRequest },
        status: result.status,
        statusText: result.statusText,
        responseTime: result.responseTime,
        responseSize: result.size,
        timestamp: Date.now(),
      })
    } finally {
      setLoading(false)
    }
  }, [activeRequest, activeEnv, isLoading])

  // Register Ctrl+Enter globally within the component so the shortcut works
  // regardless of which input (URL, headers, body, etc.) currently has focus.
  useEffect(() => {
    handleSendRef.current = handleSend
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSendRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const hasDbVars = Object.keys(dbVariables).length > 0

  const tabHasDot: Partial<Record<ReqTab, boolean>> = {
    params: activeRequest.params.some((p) => p.enabled && p.key),
    auth: activeRequest.auth.type !== 'none',
    headers: activeRequest.headers.some((h) => h.enabled && h.key),
    body: activeRequest.bodyType !== 'none',
    database: hasDbVars,
    tests: activeRequest.tests.length > 0,
  }

  const testPassCount = response?.testResults.filter((t) => t.passed).length ?? 0
  const testTotal = response?.testResults.length ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* URL Bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface flex-shrink-0">
        {/* API Type */}
        <select
          className="text-xs px-2 py-1.5 w-20"
          value={activeRequest.apiType}
          onChange={(e) => updateActiveRequest({ apiType: e.target.value as ApiType })}
        >
          <option value="REST">REST</option>
          <option value="SOAP">SOAP</option>
        </select>

        {/* Method */}
        <select
          className={`text-xs px-2 py-1.5 w-28 font-bold ${METHOD_COLORS[activeRequest.method]}`}
          value={activeRequest.method}
          onChange={(e) => updateActiveRequest({ method: e.target.value as HttpMethod })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m} className={METHOD_COLORS[m]}>{m}</option>
          ))}
        </select>

        {/* URL input */}
        <input
          className="flex-1 px-3 py-1.5 text-sm font-mono"
          placeholder="https://api.example.com/endpoint"
          value={activeRequest.url}
          onChange={(e) => updateActiveRequest({ url: e.target.value })}
          onKeyDown={() => {/* Ctrl+Enter handled by the window listener above */}}
        />

        {/* Send / Cancel */}
        <button
          className={`btn-send ${isLoading ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
          onClick={handleSend}
          title="Ctrl+Enter"
        >
          {isLoading ? '⏹ Cancel' : '▶ Send'}
        </button>
      </div>

      {/* Final URL preview — only show when the resolved/encoded URL actually
          differs from the raw URL the user typed (i.e. env vars were substituted
          or query params were encoded). */}
      {finalUrl && finalUrl !== activeRequest.url && (
        <div className="px-3 py-1 bg-bg border-b border-border text-muted text-xs font-mono truncate flex-shrink-0">
          → {finalUrl}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border flex-shrink-0">
        <input
          className="text-sm font-semibold bg-transparent border-none outline-none text-text flex-1 min-w-0"
          value={activeRequest.name}
          onChange={(e) => updateActiveRequest({ name: e.target.value })}
          placeholder="Request name"
        />
        <button className="btn btn-ghost text-xs" onClick={saveActiveRequest} title="Ctrl+S">💾 Save</button>
        <button className="btn btn-ghost text-xs" onClick={() => duplicateRequest(activeRequest.id)}>⧉ Dup</button>
        <button className="btn btn-ghost text-xs" onClick={() => setShowCodeGen(true)}>{'</>'} Code</button>
        <button className="btn btn-ghost text-xs" onClick={() => updateActiveRequest({ url: '', params: [], headers: activeRequest.headers.slice(0, 2), bodyJson: '{\n  \n}', bodyRaw: '' })}>✕ Clear</button>
      </div>

      {/* Request tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        {REQ_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-xs relative ${activeTab === tab.id ? 'tab-active text-text' : 'text-muted hover:text-text'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'tests' && testTotal > 0 && (
              <span className={`ml-1 text-[10px] px-1 rounded ${testPassCount === testTotal ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                {testPassCount}/{testTotal}
              </span>
            )}
            {tabHasDot[tab.id] && tab.id !== 'tests' && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'params' && (
          <div className="p-3">
            <KeyValueEditor
              items={activeRequest.params}
              onChange={(params) => updateActiveRequest({ params })}
              keyPlaceholder="Parameter"
              valuePlaceholder="Value"
              addLabel="Add Param"
            />
          </div>
        )}

        {activeTab === 'auth' && (
          <AuthEditor auth={activeRequest.auth} onChange={(auth) => updateActiveRequest({ auth })} />
        )}

        {activeTab === 'headers' && (
          <div className="p-3">
            <KeyValueEditor
              items={activeRequest.headers}
              onChange={(headers) => updateActiveRequest({ headers })}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
              addLabel="Add Header"
            />
          </div>
        )}

        {activeTab === 'body' && (
          <BodyEditor
            bodyType={activeRequest.bodyType}
            bodyJson={activeRequest.bodyJson}
            bodyXml={activeRequest.bodyXml}
            bodyFormData={activeRequest.bodyFormData}
            bodyUrlEncoded={activeRequest.bodyUrlEncoded}
            bodyRaw={activeRequest.bodyRaw}
            onBodyTypeChange={(bodyType) => updateActiveRequest({ bodyType })}
            onBodyJsonChange={(bodyJson) => updateActiveRequest({ bodyJson })}
            onBodyXmlChange={(bodyXml) => updateActiveRequest({ bodyXml })}
            onBodyFormDataChange={(bodyFormData) => updateActiveRequest({ bodyFormData })}
            onBodyUrlEncodedChange={(bodyUrlEncoded) => updateActiveRequest({ bodyUrlEncoded })}
            onBodyRawChange={(bodyRaw) => updateActiveRequest({ bodyRaw })}
          />
        )}

        {activeTab === 'database' && (
          <DatabaseTab />
        )}

        {activeTab === 'tests' && (
          <TestEditor
            tests={activeRequest.tests}
            onChange={(tests) => updateActiveRequest({ tests })}
            results={response?.testResults}
            response={response}
          />
        )}

        {activeTab === 'settings' && (
          <div className="p-3 flex flex-col gap-3">
            <div className="text-muted text-xs mb-1">Request Settings</div>
            <div className="flex flex-col gap-2 text-xs">
              <label className="flex items-center gap-2">
                <span className="text-muted w-32">API Type</span>
                <select
                  className="text-xs px-2 py-1.5"
                  value={activeRequest.apiType}
                  onChange={(e) => updateActiveRequest({ apiType: e.target.value as ApiType })}
                >
                  <option value="REST">REST</option>
                  <option value="SOAP">SOAP</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
