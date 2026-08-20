/**
 * WorkflowBuilder.tsx
 *
 * Visual API → DB → API workflow builder.
 * Allows chaining API requests and database queries as ordered steps.
 */
import React, { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useStore } from '../store'
import { useDbStore } from '../store/dbStore'
import { executeRequest } from '../services/apiClient'
import { runQuery, buildDbVariables } from '../services/dbClient'
import type { DbVariables } from '../types'
import { environmentService } from '../services/environmentService'
import { resolveDbVars } from '../services/dbClient'

type StepType = 'api' | 'db-query' | 'extract' | 'set-variables'

interface WorkflowStep {
  id: string
  type: StepType
  label: string
  // api
  requestId?: string
  // db-query
  connectionId?: string
  sql?: string
  // extract from API response (JSON path → variable name)
  extractions?: { jsonPath: string; varName: string }[]
  // set-variables
  variables?: { key: string; value: string }[]
}

function newStep(type: StepType): WorkflowStep {
  return { id: uuidv4(), type, label: type === 'api' ? 'API Request' : type === 'db-query' ? 'Database Query' : type === 'extract' ? 'Extract Variables' : 'Set Variables' }
}

function getJsonPath(obj: unknown, path: string): unknown {
  try {
    return path.split('.').reduce((acc, k) => (acc as Record<string, unknown>)?.[k], obj)
  } catch { return undefined }
}

type StepStatus = 'idle' | 'running' | 'success' | 'error'

interface StepResult {
  status: StepStatus
  message: string
  data?: unknown
}

export default function WorkflowBuilder() {
  const { requests, environments, activeEnvId } = useStore()
  const { connections, savedQueries } = useDbStore()
  const [steps, setSteps] = useState<WorkflowStep[]>([
    newStep('api'),
    newStep('extract'),
    newStep('db-query'),
    newStep('api'),
  ])
  const [results, setResults] = useState<Record<string, StepResult>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [runtimeVars, setRuntimeVars] = useState<DbVariables>({})

  const activeEnv = environments.find((e) => e.id === activeEnvId) ?? null

  const addStep = (type: StepType) => setSteps((s) => [...s, newStep(type)])
  const removeStep = (id: string) => setSteps((s) => s.filter((step) => step.id !== id))
  const updateStep = (id: string, patch: Partial<WorkflowStep>) =>
    setSteps((s) => s.map((step) => step.id === id ? { ...step, ...patch } : step))
  const moveStep = (id: string, dir: -1 | 1) => {
    setSteps((s) => {
      const idx = s.findIndex((step) => step.id === id)
      if (idx < 0) return s
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= s.length) return s
      const arr = [...s]
      ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
      return arr
    })
  }

  const setStepResult = (id: string, result: StepResult) =>
    setResults((r) => ({ ...r, [id]: result }))

  const runWorkflow = async () => {
    setIsRunning(true)
    setResults({})
    let vars: DbVariables = { ...runtimeVars }

    // Local mutable map used *during* execution so that later steps can read
    // results produced by earlier steps in the same run (React setState is
    // async and the closure would see stale state otherwise).
    const localData: Record<string, unknown> = {}

    for (const step of steps) {
      setStepResult(step.id, { status: 'running', message: 'Running…' })

      try {
        if (step.type === 'api') {
          const req = requests.find((r) => r.id === step.requestId)
          if (!req) { setStepResult(step.id, { status: 'error', message: 'No request selected' }); break }
          // Resolve db vars in URL + body
          const patchedReq = {
            ...req,
            url: resolveDbVars(environmentService.resolve(req.url, activeEnv), vars),
            bodyJson: resolveDbVars(req.bodyJson, vars),
          }
          const result = await executeRequest(patchedReq, activeEnv, new AbortController().signal)
          localData[step.id] = result.body
          setStepResult(step.id, { status: result.status < 400 ? 'success' : 'error', message: `${result.status} ${result.statusText} · ${result.responseTime}ms`, data: result.body })

        } else if (step.type === 'db-query') {
          const conn = connections.find((c) => c.id === step.connectionId)
          if (!conn) { setStepResult(step.id, { status: 'error', message: 'No connection selected' }); break }
          const resolvedSql = resolveDbVars(step.sql ?? '', vars)
          const result = await runQuery({ connection: conn, sql: resolvedSql })
          if (result.error) { setStepResult(step.id, { status: 'error', message: result.error }); break }
          const dbVars = buildDbVariables(result)
          // Expose as {{db.COLUMN}}
          Object.entries(dbVars).forEach(([k, v]) => { vars[`db.${k}`] = v; vars[k] = v })
          localData[step.id] = dbVars
          setStepResult(step.id, { status: 'success', message: `${result.rowCount} row(s) · ${result.executionTime}ms`, data: dbVars })

        } else if (step.type === 'extract') {
          // Walk only steps that come BEFORE the current step in the workflow order
          // to find the most-recent API step that already ran in this execution.
          const currentIdx = steps.indexOf(step)
          const prevApiStep = steps.slice(0, currentIdx).reverse().find((s) => s.type === 'api' && localData[s.id] !== undefined)
          const body = prevApiStep ? localData[prevApiStep.id] as string : ''
          if (!body) { setStepResult(step.id, { status: 'error', message: 'No API response to extract from' }); continue }
          let parsed: unknown
          try { parsed = JSON.parse(body) } catch { parsed = {} }
          const extracted: Record<string, unknown> = {}
          for (const ex of (step.extractions ?? [])) {
            const val = getJsonPath(parsed, ex.jsonPath)
            if (val !== undefined) { vars[ex.varName] = val; extracted[ex.varName] = val }
          }
          setStepResult(step.id, { status: 'success', message: `Extracted: ${Object.keys(extracted).join(', ') || 'none'}`, data: extracted })

        } else if (step.type === 'set-variables') {
          for (const v of (step.variables ?? [])) vars[v.key] = v.value
          setStepResult(step.id, { status: 'success', message: 'Variables set' })
        }
      } catch (e) {
        setStepResult(step.id, { status: 'error', message: (e as Error).message })
        break
      }
    }

    setRuntimeVars(vars)
    setIsRunning(false)
  }

  const stepIcon: Record<StepType, string> = { 'api': '🌐', 'db-query': '🗄', 'extract': '✂️', 'set-variables': '📌' }
  const stepColor: Record<StepStatus, string> = { idle: 'border-border', running: 'border-accent animate-pulse', success: 'border-success/60', error: 'border-danger/60' }

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Workflow Builder</h2>
          <p className="text-muted text-xs mt-0.5">Chain API requests and database queries together.</p>
        </div>
        <div className="flex gap-2">
          <select
            className="text-xs px-2 py-1"
            onChange={(e) => { if (e.target.value) { addStep(e.target.value as StepType); e.target.value = '' } }}
          >
            <option value="">+ Add Step</option>
            <option value="api">API Request</option>
            <option value="db-query">Database Query</option>
            <option value="extract">Extract Variables</option>
            <option value="set-variables">Set Variables</option>
          </select>
          <button
            className="btn btn-primary text-xs"
            onClick={runWorkflow}
            disabled={isRunning}
          >
            {isRunning ? '⏳ Running…' : '▶ Run Workflow'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((step, idx) => {
          const res = results[step.id]
          return (
            <div key={step.id} className="flex flex-col gap-1">
              {/* Step card */}
              <div className={`flex flex-col gap-2 p-3 rounded border bg-surface text-xs ${stepColor[res?.status ?? 'idle']}`}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{stepIcon[step.type]}</span>
                  <span className="font-semibold text-text">Step {idx + 1}: {step.label}</span>
                  <span className="text-muted px-1.5 py-0.5 rounded bg-bg border border-border capitalize text-[10px]">{step.type}</span>
                  <div className="flex-1" />
                  <button className="text-muted hover:text-text px-1" onClick={() => moveStep(step.id, -1)} disabled={idx === 0}>↑</button>
                  <button className="text-muted hover:text-text px-1" onClick={() => moveStep(step.id, 1)} disabled={idx === steps.length - 1}>↓</button>
                  <button className="text-muted hover:text-danger px-1" onClick={() => removeStep(step.id)}>✕</button>
                </div>

                {/* Step config */}
                {step.type === 'api' && (
                  <label className="flex items-center gap-2">
                    <span className="text-muted w-16">Request</span>
                    <select className="flex-1 px-2 py-1 text-xs" value={step.requestId ?? ''} onChange={(e) => updateStep(step.id, { requestId: e.target.value })}>
                      <option value="">— Select Request —</option>
                      {requests.map((r) => <option key={r.id} value={r.id}>{r.method} {r.name}</option>)}
                    </select>
                  </label>
                )}

                {step.type === 'db-query' && (
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2">
                      <span className="text-muted w-16">Connection</span>
                      <select className="flex-1 px-2 py-1 text-xs" value={step.connectionId ?? ''} onChange={(e) => updateStep(step.id, { connectionId: e.target.value })}>
                        <option value="">— Select Connection —</option>
                        {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted">SQL</span>
                      <textarea className="px-2 py-1 font-mono text-xs h-16 resize-none" value={step.sql ?? ''} onChange={(e) => updateStep(step.id, { sql: e.target.value })} placeholder="SELECT * FROM CUSTOMER WHERE ID = {{customerId}}" />
                    </label>
                  </div>
                )}

                {step.type === 'extract' && (
                  <div className="flex flex-col gap-1">
                    {(step.extractions ?? []).map((ex, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input className="flex-1 px-2 py-1 font-mono" value={ex.jsonPath} onChange={(e) => {
                          const extr = [...(step.extractions ?? [])]
                          extr[i] = { ...extr[i], jsonPath: e.target.value }
                          updateStep(step.id, { extractions: extr })
                        }} placeholder="data.customerId" />
                        <span className="text-muted">→</span>
                        <input className="flex-1 px-2 py-1 font-mono" value={ex.varName} onChange={(e) => {
                          const extr = [...(step.extractions ?? [])]
                          extr[i] = { ...extr[i], varName: e.target.value }
                          updateStep(step.id, { extractions: extr })
                        }} placeholder="customerId" />
                        <button className="text-muted hover:text-danger px-1" onClick={() => {
                          const extr = (step.extractions ?? []).filter((_, j) => j !== i)
                          updateStep(step.id, { extractions: extr })
                        }}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-ghost text-xs w-fit" onClick={() => updateStep(step.id, { extractions: [...(step.extractions ?? []), { jsonPath: '', varName: '' }] })}>+ Add Extraction</button>
                  </div>
                )}

                {step.type === 'set-variables' && (
                  <div className="flex flex-col gap-1">
                    {(step.variables ?? []).map((v, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input className="flex-1 px-2 py-1 font-mono" value={v.key} onChange={(e) => {
                          const vars = [...(step.variables ?? [])]
                          vars[i] = { ...vars[i], key: e.target.value }
                          updateStep(step.id, { variables: vars })
                        }} placeholder="variableName" />
                        <span className="text-muted">=</span>
                        <input className="flex-1 px-2 py-1 font-mono" value={v.value} onChange={(e) => {
                          const vars = [...(step.variables ?? [])]
                          vars[i] = { ...vars[i], value: e.target.value }
                          updateStep(step.id, { variables: vars })
                        }} placeholder="value" />
                        <button className="text-muted hover:text-danger px-1" onClick={() => {
                          const vars = (step.variables ?? []).filter((_, j) => j !== i)
                          updateStep(step.id, { variables: vars })
                        }}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-ghost text-xs w-fit" onClick={() => updateStep(step.id, { variables: [...(step.variables ?? []), { key: '', value: '' }] })}>+ Add Variable</button>
                  </div>
                )}

                {/* Result */}
                {res && res.status !== 'idle' && (
                  <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${res.status === 'success' ? 'bg-success/10 text-success' : res.status === 'error' ? 'bg-danger/10 text-danger' : 'text-muted'}`}>
                    {res.status === 'running' ? '⏳' : res.status === 'success' ? '✓' : '✗'} {res.message}
                  </div>
                )}
              </div>

              {/* Arrow connector */}
              {idx < steps.length - 1 && (
                <div className="flex justify-center text-muted text-lg">↓</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Runtime vars */}
      {Object.keys(runtimeVars).length > 0 && (
        <div className="p-3 bg-surface rounded border border-border text-xs">
          <div className="text-muted font-semibold mb-2">Runtime Variables</div>
          <div className="grid gap-0.5 font-mono" style={{ gridTemplateColumns: 'auto 1fr' }}>
            {Object.entries(runtimeVars).slice(0, 20).map(([k, v]) => (
              <React.Fragment key={k}>
                <span className="text-accent pr-4">{k}</span>
                <span className="text-muted truncate">= {String(v ?? '')}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
