import React, { useState } from 'react'
import type { AuthConfig, AuthType } from '../types'

interface Props {
  auth: AuthConfig
  onChange: (auth: AuthConfig) => void
}

const AUTH_TYPES: { id: AuthType; label: string }[] = [
  { id: 'none', label: 'No Auth' },
  { id: 'basic', label: 'Basic Auth' },
  { id: 'bearer', label: 'Bearer Token' },
  { id: 'apikey', label: 'API Key' },
  { id: 'oauth2', label: 'OAuth 2.0' },
]

export default function AuthEditor({ auth, onChange }: Props) {
  const [showToken, setShowToken] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const update = (patch: Partial<AuthConfig>) => onChange({ ...auth, ...patch })

  return (
    <div className="p-3 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label className="text-muted text-xs w-24">Auth Type</label>
        <select
          className="text-xs px-2 py-1.5 w-48"
          value={auth.type}
          onChange={(e) => update({ type: e.target.value as AuthType })}
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {auth.type === 'none' && (
        <p className="text-muted text-xs">No authentication will be applied to this request.</p>
      )}

      {auth.type === 'bearer' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted">Bearer Token</label>
          <div className="flex gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              className="flex-1 px-2 py-1.5 text-xs font-mono"
              placeholder="Enter bearer token or {{variable}}"
              value={auth.token ?? ''}
              onChange={(e) => update({ token: e.target.value })}
            />
            <button className="btn btn-ghost text-xs" onClick={() => setShowToken(!showToken)}>
              {showToken ? '🙈 Hide' : '👁 Show'}
            </button>
          </div>
          <p className="text-muted text-xs">Will be sent as: <code className="bg-surface px-1 rounded">Authorization: Bearer &lt;token&gt;</code></p>
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted w-24">Username</label>
            <input className="flex-1 px-2 py-1.5 text-xs" placeholder="Username or {{variable}}" value={auth.username ?? ''} onChange={(e) => update({ username: e.target.value })} />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted w-24">Password</label>
            <input type={showPass ? 'text' : 'password'} className="flex-1 px-2 py-1.5 text-xs" placeholder="Password" value={auth.password ?? ''} onChange={(e) => update({ password: e.target.value })} />
            <button className="btn btn-ghost text-xs" onClick={() => setShowPass(!showPass)}>{showPass ? '🙈' : '👁'}</button>
          </div>
          <p className="text-muted text-xs">Credentials are base64-encoded and sent as Basic auth.</p>
        </div>
      )}

      {auth.type === 'apikey' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted w-24">Key Name</label>
            <input className="flex-1 px-2 py-1.5 text-xs" placeholder="X-API-Key" value={auth.apiKeyName ?? ''} onChange={(e) => update({ apiKeyName: e.target.value })} />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted w-24">Key Value</label>
            <input type={showToken ? 'text' : 'password'} className="flex-1 px-2 py-1.5 text-xs font-mono" placeholder="API key value" value={auth.apiKeyValue ?? ''} onChange={(e) => update({ apiKeyValue: e.target.value })} />
            <button className="btn btn-ghost text-xs" onClick={() => setShowToken(!showToken)}>{showToken ? '🙈' : '👁'}</button>
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted w-24">Add to</label>
            <select className="text-xs px-2 py-1.5" value={auth.apiKeyIn ?? 'header'} onChange={(e) => update({ apiKeyIn: e.target.value as 'header' | 'query' })}>
              <option value="header">Header</option>
              <option value="query">Query Param</option>
            </select>
          </div>
        </div>
      )}

      {auth.type === 'oauth2' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted">Access Token</label>
          <div className="flex gap-2">
            <input type={showToken ? 'text' : 'password'} className="flex-1 px-2 py-1.5 text-xs font-mono" placeholder="Paste your access token" value={auth.oauth2Token ?? ''} onChange={(e) => update({ oauth2Token: e.target.value })} />
            <button className="btn btn-ghost text-xs" onClick={() => setShowToken(!showToken)}>{showToken ? '🙈' : '👁'}</button>
          </div>
          <p className="text-muted text-xs">Paste a previously obtained OAuth 2.0 access token. It will be sent as a Bearer token.</p>
        </div>
      )}
    </div>
  )
}
