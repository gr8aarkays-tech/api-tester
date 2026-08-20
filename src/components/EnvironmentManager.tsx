import React, { useState } from 'react'
import { useStore } from '../store'
import type { Environment, EnvironmentVariable } from '../types'
import { v4 as uuidv4 } from 'uuid'

export default function EnvironmentManager() {
  const { environments, createEnvironment, updateEnvironment, deleteEnvironment, setShowEnvManager, activeEnvId, setActiveEnv } = useStore()
  const [selectedId, setSelectedId] = useState<string | null>(environments[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const selected = environments.find((e) => e.id === selectedId) ?? null

  const addVar = () => {
    if (!selected) return
    const v: EnvironmentVariable = { id: uuidv4(), key: '', value: '', secret: false, enabled: true }
    updateEnvironment({ ...selected, variables: [...selected.variables, v] })
  }

  const updateVar = (id: string, field: keyof EnvironmentVariable, value: string | boolean) => {
    if (!selected) return
    updateEnvironment({
      ...selected,
      variables: selected.variables.map((v) => v.id === id ? { ...v, [field]: value } : v),
    })
  }

  const removeVar = (id: string) => {
    if (!selected) return
    updateEnvironment({ ...selected, variables: selected.variables.filter((v) => v.id !== id) })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowEnvManager(false)}>
      <div className="bg-surface rounded-lg border border-border shadow-2xl w-[800px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Environments</h2>
          <button className="text-muted hover:text-text" onClick={() => setShowEnvManager(false)}>✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: env list */}
          <div className="w-48 border-r border-border flex flex-col">
            <div className="flex-1 overflow-y-auto p-2">
              {environments.map((env) => (
                <div
                  key={env.id}
                  className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer text-xs ${selectedId === env.id ? 'bg-accent/20 text-white' : 'hover:bg-bg text-text'}`}
                  onClick={() => setSelectedId(env.id)}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activeEnvId === env.id ? 'bg-success' : 'bg-muted'}`} />
                  <span className="flex-1 truncate">{env.name}</span>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border">
              {adding ? (
                <div className="flex flex-col gap-1">
                  <input
                    autoFocus
                    className="text-xs px-2 py-1"
                    placeholder="Env name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newName.trim()) {
                        createEnvironment(newName.trim())
                        // createEnvironment is synchronous — read from live store state
                        const newId = useStore.getState().environments.slice(-1)[0]?.id
                        if (newId) setSelectedId(newId)
                        setNewName(''); setAdding(false)
                      }
                      if (e.key === 'Escape') setAdding(false)
                    }}
                  />
                  <div className="flex gap-1">
                    <button className="btn btn-primary text-xs flex-1" onClick={() => {
                      if (newName.trim()) {
                        createEnvironment(newName.trim())
                        const newId = useStore.getState().environments.slice(-1)[0]?.id
                        if (newId) setSelectedId(newId)
                        setNewName(''); setAdding(false)
                      }
                    }}>Create</button>
                    <button className="btn btn-ghost text-xs" onClick={() => setAdding(false)}>✕</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-ghost text-xs w-full" onClick={() => setAdding(true)}>+ New</button>
              )}
            </div>
          </div>

          {/* Right: variables */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text">{selected.name}</span>
                    {activeEnvId === selected.id
                      ? <span className="text-[10px] text-success bg-success/10 px-2 py-0.5 rounded">Active</span>
                      : <button className="btn btn-ghost text-xs" onClick={() => setActiveEnv(selected.id)}>Set Active</button>
                    }
                  </div>
                  <button className="btn btn-ghost text-xs text-danger" onClick={() => { deleteEnvironment(selected.id); setSelectedId(null) }}>Delete</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex text-muted text-xs mb-2 gap-2 px-1">
                    <span className="w-4" />
                    <span className="flex-1">Variable</span>
                    <span className="flex-1">Value</span>
                    <span className="w-14 text-center">Secret</span>
                    <span className="w-6" />
                  </div>
                  {selected.variables.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 mb-1">
                      <input type="checkbox" checked={v.enabled} onChange={(e) => updateVar(v.id, 'enabled', e.target.checked)} className="accent-accent w-4 h-4" />
                      <input className="flex-1 px-2 py-1 text-xs font-mono" value={v.key} placeholder="VARIABLE_NAME" onChange={(e) => updateVar(v.id, 'key', e.target.value)} />
                      <input
                        type={v.secret ? 'password' : 'text'}
                        className="flex-1 px-2 py-1 text-xs font-mono"
                        value={v.value}
                        placeholder="value or {{reference}}"
                        onChange={(e) => updateVar(v.id, 'value', e.target.value)}
                      />
                      <div className="w-14 flex justify-center">
                        <input type="checkbox" checked={v.secret} onChange={(e) => updateVar(v.id, 'secret', e.target.checked)} className="accent-accent w-4 h-4" title="Mask value" />
                      </div>
                      <button onClick={() => removeVar(v.id)} className="w-6 text-muted hover:text-danger text-xs">✕</button>
                    </div>
                  ))}
                  <button className="btn btn-ghost text-xs mt-2" onClick={addVar}>+ Add Variable</button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted text-xs">
                Select an environment to edit its variables.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
