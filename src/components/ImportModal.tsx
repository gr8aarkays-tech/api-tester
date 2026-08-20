import React, { useState } from 'react'
import { useStore } from '../store'
import { parseCurl } from '../utils/curlParser'
import { newRequest } from '../types'
import { v4 as uuidv4 } from 'uuid'
import yaml from 'js-yaml'

type ImportMode = 'curl' | 'postman' | 'openapi'

export default function ImportModal() {
  const { setShowImport, collections, createCollection } = useStore()
  const [mode, setMode] = useState<ImportMode>('curl')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [targetCol, setTargetCol] = useState(collections[0]?.id ?? '')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    setError(null); setResult(null)
    let content = text

    if (file) {
      content = await file.text()
    }

    if (!content.trim()) { setError('Please provide content to import.'); return }

    // Resolve or create the target collection
    let resolvedColId = targetCol
    if (!resolvedColId) {
      createCollection('Imported Collection')
      // createCollection is synchronous — read the freshly-created collection id
      resolvedColId = useStore.getState().collections.slice(-1)[0]?.id ?? uuidv4()
    }
    const colId = resolvedColId

    // Helper: persist a batch of already-constructed requests through the store
    // so dirty-state, tabs and localStorage all stay in sync.
    const persistBatch = (items: ReturnType<typeof newRequest>[]) => {
      const existing = useStore.getState().requests
      const merged = [...existing, ...items]
      useStore.setState({ requests: merged })
      // Persist synchronously via a static import to keep localStorage in sync.
      import('../services/storageService').then(({ storageService }) => {
        storageService.saveRequests(merged)
      })
    }

    try {
      if (mode === 'curl') {
        const parsed = parseCurl(content)
        const req = newRequest({ ...parsed, collectionId: colId })
        persistBatch([req])
        setResult(`Imported 1 request: ${req.method} ${req.url}`)
        useStore.getState().openRequest(req.id)
        return
      }

      if (mode === 'postman') {
        const data = JSON.parse(content)
        const items: ReturnType<typeof newRequest>[] = []

        const processItem = (item: Record<string, unknown>) => {
          if (item.request) {
            const r = item.request as Record<string, unknown>
            const urlObj = r.url as Record<string, unknown>
            const rawUrl = typeof urlObj === 'string' ? urlObj : (urlObj?.raw as string) ?? ''
            const method = (r.method as string) ?? 'GET'
            const headers = ((r.header as unknown[]) ?? []).map((h: unknown) => {
              const hh = h as Record<string, string>
              return { id: uuidv4(), key: hh.key ?? '', value: hh.value ?? '', enabled: true }
            })
            let bodyJson = ''; let bodyType: 'none' | 'json' = 'none'
            const body = r.body as Record<string, unknown>
            if (body?.mode === 'raw' && body?.raw) { bodyJson = body.raw as string; bodyType = 'json' }
            items.push(newRequest({ name: item.name as string, method: method as ReturnType<typeof newRequest>['method'], url: rawUrl, headers, bodyJson, bodyType, collectionId: colId }))
          }
          if (item.item) {
            for (const child of item.item as Record<string, unknown>[]) processItem(child as Record<string, unknown>)
          }
        }

        const root = data.item ?? (data.collection?.item ?? []) as Record<string, unknown>[]
        if (Array.isArray(root)) {
          for (const item of root) processItem(item as Record<string, unknown>)
        }

        persistBatch(items)
        setResult(`Imported ${items.length} request(s) from Postman collection.`)
        return
      }

      if (mode === 'openapi') {
        let spec: Record<string, unknown>
        try { spec = JSON.parse(content) } catch { spec = yaml.load(content) as Record<string, unknown> }

        const items: ReturnType<typeof newRequest>[] = []
        const baseUrl = (((spec.servers as unknown[])?.[0]) as Record<string, string>)?.url ?? ''
        const paths = spec.paths as Record<string, Record<string, unknown>>

        for (const [path, methods] of Object.entries(paths ?? {})) {
          for (const [method, op] of Object.entries(methods as Record<string, unknown>)) {
            if (['get','post','put','patch','delete','head','options'].includes(method)) {
              const operation = op as Record<string, unknown>
              items.push(newRequest({
                name: (operation.summary as string) || `${method.toUpperCase()} ${path}`,
                method: method.toUpperCase() as ReturnType<typeof newRequest>['method'],
                url: `${baseUrl}${path}`,
                collectionId: colId,
              }))
            }
          }
        }

        persistBatch(items)
        setResult(`Imported ${items.length} endpoint(s) from OpenAPI spec.`)
        return
      }
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Parse error')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowImport(false)}>
      <div className="bg-surface rounded-lg border border-border shadow-2xl w-[640px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Import APIs</h2>
          <button className="text-muted hover:text-text" onClick={() => setShowImport(false)}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(['curl', 'postman', 'openapi'] as ImportMode[]).map((m) => (
              <button key={m} className={`btn ${mode === m ? 'btn-primary' : 'btn-ghost'} text-xs capitalize`} onClick={() => setMode(m)}>
                {m === 'openapi' ? 'OpenAPI / Swagger' : m === 'postman' ? 'Postman Collection' : 'cURL'}
              </button>
            ))}
          </div>

          {/* Target collection */}
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs w-32">Import into</label>
            <select className="flex-1 text-xs px-2 py-1.5" value={targetCol} onChange={(e) => setTargetCol(e.target.value)}>
              <option value="">Create new collection</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* File upload */}
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs w-32">Upload file</label>
            <input type="file" accept=".json,.yaml,.yml,.txt" className="text-xs text-text" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Text area */}
          <div>
            <label className="text-muted text-xs block mb-1">Or paste content</label>
            <textarea
              className="w-full h-40 px-2 py-2 text-xs font-mono resize-none"
              placeholder={mode === 'curl' ? 'curl --request GET --url https://api.example.com/users' : mode === 'postman' ? 'Paste Postman Collection JSON...' : 'Paste OpenAPI JSON or YAML...'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {error && <div className="text-danger text-xs bg-danger/10 border border-danger/30 rounded p-2">{error}</div>}
          {result && <div className="text-success text-xs bg-success/10 border border-success/30 rounded p-2">{result}</div>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button className="btn btn-ghost text-xs" onClick={() => setShowImport(false)}>Cancel</button>
          <button className="btn btn-primary text-xs" onClick={handleImport}>Import</button>
        </div>
      </div>
    </div>
  )
}
