import React, { useState } from 'react'
import { useStore } from '../store'
import { generateCode, LANGUAGES } from '../utils/codeGenerator'
import { generateCurl } from '../utils/curlParser'
import { environmentService } from '../services/environmentService'

export default function CodeGenerator() {
  const { activeRequest, setShowCodeGen, environments, activeEnvId } = useStore()
  const [lang, setLang] = useState<(typeof LANGUAGES)[0]['id']>('curl')
  const [copied, setCopied] = useState(false)

  const activeEnv = environments.find((e) => e.id === activeEnvId) ?? null

  if (!activeRequest) return null

  // Resolve environment variables in the request before generating code so
  // the output contains actual values rather than {{placeholder}} tokens.
  const envVars: Record<string, string> = {}
  if (activeEnv) {
    for (const v of activeEnv.variables) if (v.enabled) envVars[v.key] = v.value
  }
  const resolvedRequest = {
    ...activeRequest,
    url: environmentService.resolve(activeRequest.url, activeEnv),
    headers: activeRequest.headers.map((h) => ({
      ...h,
      key: environmentService.resolve(h.key, activeEnv),
      value: environmentService.resolve(h.value, activeEnv),
    })),
  }

  const code = generateCode(resolvedRequest, lang)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowCodeGen(false)}>
      <div className="bg-surface rounded-lg border border-border shadow-2xl w-[760px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Generate Code — {activeRequest.name}</h2>
          <button className="text-muted hover:text-text" onClick={() => setShowCodeGen(false)}>✕</button>
        </div>

        <div className="flex gap-0 flex-1 overflow-hidden">
          {/* Language picker */}
          <div className="w-44 border-r border-border flex flex-col gap-0.5 p-2 overflow-y-auto">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                className={`text-left px-3 py-2 rounded text-xs ${lang === l.id ? 'bg-accent text-white' : 'text-muted hover:text-text hover:bg-bg'}`}
                onClick={() => setLang(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Code output */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
              <span className="text-muted text-xs flex-1">{LANGUAGES.find((l) => l.id === lang)?.label}</span>
              <button className="btn btn-ghost text-xs" onClick={handleCopy}>{copied ? '✓ Copied!' : 'Copy'}</button>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-text whitespace-pre-wrap bg-bg">
              {code}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
