import React from 'react'
import { useStore } from '../store'
import { useDbStore } from '../store/dbStore'

export default function SettingsModal() {
  const { settings, updateSettings, setShowSettings } = useStore()
  const backendOnline = useDbStore((s) => s.backendOnline)

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowSettings(false)}>
      <div className="bg-surface rounded-lg border border-border shadow-2xl w-[480px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Settings</h2>
          <button className="text-muted hover:text-text" onClick={() => setShowSettings(false)}>✕</button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Request Timeout (ms)</label>
            <input
              type="number"
              className="px-2 py-1.5 text-xs w-32"
              value={settings.requestTimeout}
              onChange={(e) => updateSettings({ requestTimeout: +e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.followRedirects}
              onChange={(e) => updateSettings({ followRedirects: e.target.checked })}
              className="accent-accent"
              id="follow-redirects"
            />
            <label htmlFor="follow-redirects" className="text-xs text-text">Follow Redirects</label>
          </div>

          <div className="border border-border rounded p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text">CORS Proxy</span>
            </div>

            <p className="text-[11px] text-muted leading-relaxed">
              When a target API blocks cross-origin requests, enable a proxy to relay them
              and bypass browser CORS restrictions.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.useProxy}
                onChange={(e) => updateSettings({ useProxy: e.target.checked })}
                className="accent-accent"
                id="use-proxy"
              />
              <label htmlFor="use-proxy" className="text-xs text-text">Enable proxy</label>
            </div>

            {settings.useProxy && (
              <>
                {/* Mode selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted">Proxy mode</label>
                  <div className="flex gap-2">
                    {(['public', 'local'] as const).map((mode) => (
                      <button
                        key={mode}
                        className={`px-3 py-1.5 text-xs rounded border ${settings.proxyMode === mode ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-text'}`}
                        onClick={() => updateSettings({ proxyMode: mode })}
                      >
                        {mode === 'public' ? '🌐 Public (corsproxy.io)' : '🖥 Local (port 4001)'}
                      </button>
                    ))}
                  </div>
                </div>

                {settings.proxyMode === 'public' && (
                  <div className="flex flex-col gap-2">
                    <div className="bg-bg rounded p-2 text-[11px] text-muted leading-relaxed">
                      Relays requests through a CORS proxy service. Works directly on GitHub Pages with no local server required.{' '}
                      <span className="text-warning">Do not relay sensitive passwords or private production tokens through third-party public proxies.</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted">Custom Public Proxy URL (optional)</label>
                      <input
                        className="px-2 py-1.5 text-xs flex-1 bg-surface border border-border rounded"
                        placeholder="https://corsproxy.io/?url= or your Cloudflare worker URL"
                        value={settings.publicProxyUrl || ''}
                        onChange={(e) => updateSettings({ publicProxyUrl: e.target.value })}
                      />
                      <span className="text-[10px] text-muted">Supports <code>{'{url}'}</code> placeholder or append format (e.g. <code>https://my-proxy.workers.dev/?url=</code>)</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted">CORS Proxy API Key (optional)</label>
                      <input
                        type="password"
                        className="px-2 py-1.5 text-xs flex-1 bg-surface border border-border rounded"
                        placeholder="corsproxy.io API Key (if using a paid key)"
                        value={settings.corsApiKey || ''}
                        onChange={(e) => updateSettings({ corsApiKey: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {settings.proxyMode === 'local' && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted">Backend server status</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${backendOnline ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                        {backendOnline ? '● Online' : '● Offline'}
                      </span>
                    </div>
                    {!backendOnline && (
                      <div className="bg-bg rounded p-2">
                        <p className="text-[11px] text-warning mb-1">Start the backend server:</p>
                        <pre className="font-mono text-[10px] text-text select-all">cd API/server &amp;&amp; npm install &amp;&amp; node index.js</pre>
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted">Backend URL</label>
                      <input
                        className="px-2 py-1.5 text-xs flex-1"
                        placeholder="http://localhost:4001"
                        value={settings.proxyUrl}
                        onChange={(e) => updateSettings({ proxyUrl: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <h3 className="text-xs font-semibold text-muted mb-2">Keyboard Shortcuts</h3>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted">
              {[
                ['Ctrl+Enter', 'Send Request'],
                ['Ctrl+S', 'Save Request'],
                ['Ctrl+N', 'New Request'],
                ['Ctrl+K', 'Global Search'],
                ['Ctrl+/', 'Toggle Sidebar'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <kbd className="bg-bg border border-border rounded px-1.5 py-0.5 font-mono text-[10px]">{key}</kbd>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button className="btn btn-primary text-xs" onClick={() => setShowSettings(false)}>Done</button>
        </div>
      </div>
    </div>
  )
}
