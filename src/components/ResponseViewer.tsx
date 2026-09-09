import React, { useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { oneDark } from '@codemirror/theme-one-dark'
import { useStore } from '../store'
import { useDbStore } from '../store/dbStore'
import { formatJson } from '../utils/jsonFormatter'
import { formatXml, formatBytes, detectBodyLanguage } from '../utils/jsonFormatter'

type RespTab = 'body' | 'headers' | 'cookies' | 'timeline' | 'tests'

const RESP_TABS: { id: RespTab; label: string }[] = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'tests', label: 'Test Results' },
]

type BodyView = 'pretty' | 'raw' | 'preview'

function StatusBadge({ status }: { status: number }) {
  const cls = status >= 500 ? 'text-danger' : status >= 400 ? 'text-warning' : status >= 300 ? 'text-info' : 'text-success'
  const text = status === 0 ? 'ERR' : status
  return <span className={`font-bold text-sm ${cls}`}>{text}</span>
}

function isCorsError(msg: string) {
  return msg.includes('Network Error') || msg.includes('CORS') || msg.includes('Failed to fetch') || msg.includes('NetworkError')
}

function ErrorPanel({ error }: { error: string }) {
  const { settings, updateSettings, setShowSettings } = useStore()
  const backendOnline = useDbStore((s) => s.backendOnline)
  const isCors = isCorsError(error)

  const enableProxy = () => {
    updateSettings({ useProxy: true, proxyUrl: settings.proxyUrl || 'http://localhost:4001' })
  }

  if (isCors) {
    return (
      <div className="flex flex-col gap-4 p-5 max-w-xl">
        <div className="flex items-center gap-2">
          <span className="text-danger text-lg">✕</span>
          <span className="text-danger font-semibold text-sm">Request Failed — Network / CORS Error</span>
        </div>

        <p className="text-xs text-muted leading-relaxed">
          The browser blocked this request because the target API does not allow cross-origin requests
          from this origin. This is a browser security restriction, not an API bug.
        </p>

        {/* Proxy fix — primary recommendation */}
        <div className={`rounded border p-3 flex flex-col gap-2 ${backendOnline ? 'border-success/40 bg-success/5' : 'border-border bg-surface'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text">
              Fix: Route requests through the local proxy
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${backendOnline ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
              Backend {backendOnline ? 'online ✓' : 'offline ✗'}
            </span>
          </div>
          <p className="text-[11px] text-muted">
            The backend proxy server runs locally on port 4001 and forwards requests server-side,
            bypassing browser CORS restrictions entirely.
          </p>
          {settings.useProxy ? (
            <div className="flex items-center gap-2 text-xs text-success">
              <span>✓</span> Proxy is already enabled — if requests still fail, check that the backend is running.
            </div>
          ) : (
            <button
              className="btn btn-primary text-xs self-start"
              onClick={enableProxy}
              disabled={false}
            >
              Enable Proxy
            </button>
          )}
          {!backendOnline && (
            <div className="text-[11px] text-warning mt-1">
              Backend is not reachable. Start it first:
              <pre className="mt-1 bg-bg rounded px-2 py-1 font-mono text-[10px] text-text select-all">cd API/server &amp;&amp; npm install &amp;&amp; node index.js</pre>
            </div>
          )}
        </div>

        {/* Other possible causes */}
        <div className="rounded border border-border bg-surface p-3 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text">Other possible causes</span>
          <ul className="text-[11px] text-muted flex flex-col gap-1 list-disc list-inside">
            <li>The URL is incorrect or the host is unreachable</li>
            <li>The target server is down</li>
            <li>A VPN or firewall is blocking the connection</li>
            <li>HTTPS → HTTP mixed-content block</li>
          </ul>
        </div>

        <button className="text-xs text-accent hover:underline self-start" onClick={() => setShowSettings(true)}>
          Open Settings →
        </button>
      </div>
    )
  }

  // Generic error
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-danger font-semibold text-sm">Request Failed</div>
      <div className="rounded border border-danger/30 bg-danger/10 p-4 text-xs text-danger whitespace-pre-wrap font-mono">
        {error}
      </div>
    </div>
  )
}

export default function ResponseViewer() {
  const { response, isLoading } = useStore()
  const [activeTab, setActiveTab] = useState<RespTab>('body')
  const [bodyView, setBodyView] = useState<BodyView>('pretty')
  const [searchText, setSearchText] = useState('')
  const [copied, setCopied] = useState(false)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
        <div className="animate-spin text-2xl">⟳</div>
        <div className="text-sm">Sending request...</div>
      </div>
    )
  }

  if (!response) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted gap-2">
        <div className="text-3xl">📭</div>
        <div className="text-sm">No response yet — send a request to see results.</div>
      </div>
    )
  }

  if (response.error) {
    return <ErrorPanel error={response.error} />
  }

  const bodyLang = detectBodyLanguage(response.headers, response.body)
  const formattedBody = bodyLang === 'json' ? formatJson(response.body) : bodyLang === 'xml' ? formatXml(response.body) : response.body

  const displayBody = bodyView === 'pretty' ? formattedBody : response.body
  const filteredBody = searchText ? displayBody.split('\n').filter((l) => l.toLowerCase().includes(searchText.toLowerCase())).join('\n') : displayBody

  const handleCopy = () => {
    navigator.clipboard.writeText(response.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDownload = () => {
    const ext = bodyLang === 'json' ? 'json' : bodyLang === 'xml' ? 'xml' : 'txt'
    const blob = new Blob([response.body], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `response.${ext}`; a.click()
    URL.revokeObjectURL(url)
  }

  const passedTests = response.testResults.filter((t) => t.passed).length
  const totalTests = response.testResults.length

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={response.status} />
          <span className="text-muted text-xs">{response.statusText}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <span>⏱</span>
          <span className={response.responseTime > 1000 ? 'text-warning' : 'text-success'}>{response.responseTime}ms</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <span>📦</span>
          <span>{formatBytes(response.size)}</span>
        </div>
        {totalTests > 0 && (
          <div className={`flex items-center gap-1 text-xs ml-auto ${passedTests === totalTests ? 'text-success' : 'text-danger'}`}>
            ✓ {passedTests}/{totalTests} tests passed
          </div>
        )}
      </div>

      {/* Response tabs */}
      <div className="flex border-b border-border flex-shrink-0">
        {RESP_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-xs ${activeTab === tab.id ? 'tab-active text-text' : 'text-muted hover:text-text'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'headers' && <span className="ml-1 text-muted text-[10px]">({Object.keys(response.headers).length})</span>}
            {tab.id === 'tests' && totalTests > 0 && (
              <span className={`ml-1 text-[10px] px-1 rounded ${passedTests === totalTests ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                {passedTests}/{totalTests}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* BODY */}
        {activeTab === 'body' && (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0">
              {(['pretty', 'raw', 'preview'] as const).map((v) => (
                <button key={v} className={`btn btn-ghost text-xs capitalize ${bodyView === v ? 'bg-accent/20 text-accent border-accent/40' : ''}`} onClick={() => setBodyView(v)}>
                  {v}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1">
                <input
                  className="px-2 py-0.5 text-xs w-36"
                  placeholder="Search..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <button className="btn btn-ghost text-xs" onClick={handleCopy}>{copied ? '✓ Copied' : 'Copy'}</button>
                <button className="btn btn-ghost text-xs" onClick={handleDownload}>⬇ Download</button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {bodyView === 'preview' && bodyLang === 'html' ? (
                <iframe
                  srcDoc={response.body}
                  className="w-full h-full border-none"
                  sandbox="allow-same-origin"
                  title="Response Preview"
                />
              ) : bodyLang === 'json' && bodyView === 'pretty' ? (
                <CodeMirror
                  value={filteredBody}
                  height="100%"
                  theme={oneDark}
                  extensions={[json()]}
                  editable={false}
                  className="h-full text-xs"
                />
              ) : bodyLang === 'xml' && bodyView === 'pretty' ? (
                <CodeMirror
                  value={filteredBody}
                  height="100%"
                  theme={oneDark}
                  extensions={[xml()]}
                  editable={false}
                  className="h-full text-xs"
                />
              ) : (
                <pre className="p-3 text-xs font-mono text-text overflow-auto h-full whitespace-pre-wrap break-all">
                  {filteredBody}
                </pre>
              )}
            </div>
          </>
        )}

        {/* HEADERS */}
        {activeTab === 'headers' && (
          <div className="overflow-auto flex-1 p-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-1 pr-4 w-48">Header</th>
                  <th className="text-left py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(response.headers).map(([k, v]) => (
                  <tr key={k} className="border-b border-border/40 hover:bg-surface">
                    <td className="py-1.5 pr-4 font-mono text-muted">{k}</td>
                    <td className="py-1.5 font-mono text-text break-all">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* COOKIES */}
        {activeTab === 'cookies' && (
          <div className="p-3 text-muted text-xs">
            {response.headers['set-cookie']
              ? <pre className="font-mono text-text">{response.headers['set-cookie']}</pre>
              : 'No cookies in this response.'}
          </div>
        )}

        {/* TIMELINE — real values derived from measured responseTime + size */}
        {activeTab === 'timeline' && (() => {
          // The browser Fetch API doesn't expose per-phase timings, so we
          // apportion the total responseTime into a reasonable breakdown.
          // Total = responseTime ms.  Sizes are capped at 100% proportionally.
          const total = response.responseTime || 1
          // Rough heuristics: DNS ~5%, TCP ~5%, TTFB ~75%, Download ~15%
          const dns      = Math.max(1, Math.round(total * 0.05))
          const tcp      = Math.max(1, Math.round(total * 0.05))
          const ttfb     = Math.max(1, Math.round(total * 0.75))
          const download = Math.max(1, total - dns - tcp - ttfb)
          const bar = (ms: number) => `${Math.min(100, Math.round((ms / total) * 100))}%`
          return (
            <div className="p-3 flex flex-col gap-2 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-muted font-semibold">Request Timeline</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-warning/20 text-warning font-semibold">
                  ⚠ Estimated — browser Fetch API does not expose real per-phase timings
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted w-32">DNS Lookup</span>
                <div className="flex-1 bg-border rounded h-2"><div className="bg-info h-2 rounded" style={{ width: bar(dns) }} /></div>
                <span className="text-muted w-16">~{dns}ms</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted w-32">TCP Connect</span>
                <div className="flex-1 bg-border rounded h-2"><div className="bg-accent h-2 rounded" style={{ width: bar(tcp) }} /></div>
                <span className="text-muted w-16">~{tcp}ms</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted w-32">Wait (TTFB)</span>
                <div className="flex-1 bg-border rounded h-2"><div className="bg-success h-2 rounded" style={{ width: bar(ttfb) }} /></div>
                <span className="text-muted w-16">~{ttfb}ms</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted w-32">Download</span>
                <div className="flex-1 bg-border rounded h-2"><div className="bg-warning h-2 rounded" style={{ width: bar(download) }} /></div>
                <span className="text-muted w-16">{formatBytes(response.size)}</span>
              </div>
              <div className="text-muted mt-1">Total: {response.responseTime}ms</div>
            </div>
          )
        })()}

        {/* TEST RESULTS */}
        {activeTab === 'tests' && (
          <div className="p-3 flex flex-col gap-1 overflow-auto flex-1">
            {response.testResults.length === 0 && (
              <div className="text-muted text-xs">No tests defined. Add tests in the Tests tab.</div>
            )}
            {response.testResults.map((r, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs py-1.5 border-b border-border/40 ${r.passed ? 'text-success' : 'text-danger'}`}>
                <span className="flex-shrink-0">{r.passed ? '✓' : '✗'}</span>
                <span className="flex-1">{r.name}</span>
                <span className="text-muted">{r.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
