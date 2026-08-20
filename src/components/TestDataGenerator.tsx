import React, { useState, useCallback } from 'react'
import { useTdStore } from '../store/testDataStore'
import { useDbStore } from '../store/dbStore'
import type { TdFieldCondition, TdFieldDbSource, TdGenerationMode } from '../types'

// ─── Tiny helpers ──────────────────────────────────────────────────────────────

const FIELD_TYPES = [
  'string','number','integer','boolean','date','datetime',
  'email','phone','uuid','enum','regex','custom',
] as const

const GEN_MODES: TdGenerationMode[] = ['random','unique','sequential','boundary','negative','mixed']
const COUNT_OPTIONS = [1, 5, 10, 50, 100, 500]

function cls(...args: (string | false | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

// ─── DB Source Config Panel ────────────────────────────────────────────────────

interface DbSourcePanelProps {
  cond: TdFieldCondition
  onSave: (src: TdFieldDbSource | undefined) => void
  onClose: () => void
}

function DbSourcePanel({ cond, onSave, onClose }: DbSourcePanelProps) {
  const connections = useDbStore((s) => s.connections)
  const [src, setSrc] = useState<TdFieldDbSource>(
    cond.dbSource ?? { connectionId: '', sql: '', column: '', pickMode: 'random' },
  )
  const [previewValues, setPreviewValues] = useState<unknown[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const BASE: string = ((import.meta as any).env?.VITE_DB_BACKEND as string | undefined) ?? 'http://localhost:4001'

  const handlePreview = useCallback(async () => {
    const conn = connections.find((c) => c.id === src.connectionId)
    if (!conn || !src.sql || !src.column) return
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewValues(null)
    try {
      const res = await fetch(`${BASE}/db/query-values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: conn, sql: src.sql, column: src.column }),
      })
      const data = await res.json()
      if (data.error) { setPreviewError(data.error); return }
      setPreviewValues(data.values ?? [])
    } catch (e) {
      setPreviewError((e as Error).message)
    } finally {
      setPreviewLoading(false)
    }
  }, [src, connections, BASE])

  const isValid = src.connectionId && src.sql.trim() && src.column.trim()

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg border border-border rounded-lg shadow-xl w-[560px] max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-text">
            🗄️ DB Source — <span className="text-accent">{cond.name}</span>
          </span>
          <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">×</button>
        </div>

        {/* Connection */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted font-medium">Connection</label>
          <select
            value={src.connectionId}
            onChange={(e) => setSrc({ ...src, connectionId: e.target.value })}
            className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent"
          >
            <option value="">— select connection —</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.dbType})</option>
            ))}
          </select>
          {connections.length === 0 && (
            <p className="text-xs text-yellow-400">No DB connections saved. Add one in the Database tab first.</p>
          )}
        </div>

        {/* SQL */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted font-medium">SQL Query</label>
          <textarea
            rows={3}
            value={src.sql}
            onChange={(e) => setSrc({ ...src, sql: e.target.value })}
            placeholder={`SELECT firstName FROM users WHERE status = 'ACTIVE'`}
            className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent resize-y"
          />
          <p className="text-xs text-muted">The query can return multiple rows — one value will be picked per record.</p>
        </div>

        {/* Column */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted font-medium">Column to use</label>
          <input
            type="text"
            value={src.column}
            onChange={(e) => setSrc({ ...src, column: e.target.value })}
            placeholder="firstName"
            className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent"
          />
        </div>

        {/* Pick mode */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted font-medium">Pick mode</label>
          <div className="flex gap-3">
            {(['random','sequential','first'] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-xs text-text cursor-pointer">
                <input
                  type="radio"
                  name="pickMode"
                  value={m}
                  checked={(src.pickMode ?? 'random') === m}
                  onChange={() => setSrc({ ...src, pickMode: m })}
                  className="accent-accent"
                />
                {m}
              </label>
            ))}
          </div>
        </div>

        {/* Preview */}
        {isValid && (
          <div className="flex flex-col gap-2">
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="self-start bg-surface border border-border rounded px-3 py-1 text-xs text-text hover:border-accent transition-colors disabled:opacity-50"
            >
              {previewLoading ? 'Loading…' : '🔍 Preview values'}
            </button>
            {previewError && <p className="text-xs text-red-400">⚠ {previewError}</p>}
            {previewValues !== null && (
              <div className="bg-surface border border-border rounded p-2 text-xs text-text font-mono max-h-32 overflow-y-auto">
                {previewValues.length === 0
                  ? <span className="text-muted">No rows returned</span>
                  : previewValues.slice(0, 20).map((v, i) => (
                      <div key={i} className="truncate">{String(v)}</div>
                    ))
                }
                {previewValues.length > 20 && (
                  <div className="text-muted">…and {previewValues.length - 20} more</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t border-border">
          <button
            onClick={() => isValid && onSave(src)}
            disabled={!isValid}
            className="bg-accent text-white rounded px-4 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Apply DB Source
          </button>
          <button
            onClick={() => onSave(undefined)}
            className="bg-surface border border-border rounded px-3 py-1.5 text-xs text-text hover:border-red-400 transition-colors"
          >
            Remove DB Source
          </button>
          <button onClick={onClose} className="ml-auto text-xs text-muted hover:text-text">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Field Row ──────────────────────────────────────────────────────────────────

interface FieldRowProps {
  fileId: string
  cond: TdFieldCondition
}

function FieldRow({ fileId, cond }: FieldRowProps) {
  const updateField = useTdStore((s) => s.updateField)
  const deleteField = useTdStore((s) => s.deleteField)
  const [showDbPanel, setShowDbPanel] = useState(false)

  const upd = (patch: Partial<TdFieldCondition>) => updateField(fileId, { ...cond, ...patch })
  const hasDb = !!(cond.dbSource?.connectionId && cond.dbSource?.sql && cond.dbSource?.column)

  return (
    <>
      <tr className="border-b border-border hover:bg-surface/50 text-xs">
        {/* Name */}
        <td className="px-2 py-1.5">
          <input
            value={cond.name}
            onChange={(e) => upd({ name: e.target.value })}
            className="bg-transparent border-b border-border focus:outline-none focus:border-accent w-28 text-text"
          />
        </td>

        {/* Type */}
        <td className="px-2 py-1.5">
          <select
            value={cond.type}
            onChange={(e) => upd({ type: e.target.value as TdFieldCondition['type'] })}
            className="bg-surface border border-border rounded px-1 py-0.5 text-text focus:outline-none focus:border-accent"
          >
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </td>

        {/* Required */}
        <td className="px-2 py-1.5 text-center">
          <input type="checkbox" checked={cond.required} onChange={(e) => upd({ required: e.target.checked })} className="accent-accent" />
        </td>

        {/* Unique */}
        <td className="px-2 py-1.5 text-center">
          <input type="checkbox" checked={cond.unique} onChange={(e) => upd({ unique: e.target.checked })} className="accent-accent" />
        </td>

        {/* DB Source indicator + button */}
        <td className="px-2 py-1.5">
          <button
            onClick={() => setShowDbPanel(true)}
            title={hasDb ? `DB: ${cond.dbSource!.sql}` : 'Attach DB source'}
            className={cls(
              'flex items-center gap-1 rounded px-2 py-0.5 text-xs border transition-colors',
              hasDb
                ? 'border-accent text-accent bg-accent/10 hover:bg-accent/20'
                : 'border-border text-muted hover:border-accent hover:text-text',
            )}
          >
            {hasDb ? '🗄️ DB' : '+ DB'}
          </button>
        </td>

        {/* Allowed values / pattern */}
        <td className="px-2 py-1.5">
          <input
            value={cond.allowedValues?.join(',') ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim()
              upd({ allowedValues: v ? v.split(',').map((s) => s.trim()) : undefined })
            }}
            placeholder="a,b,c"
            className="bg-transparent border-b border-border focus:outline-none focus:border-accent w-28 text-text"
          />
        </td>

        {/* Min / Max */}
        <td className="px-2 py-1.5 flex gap-1">
          <input
            type="number"
            value={cond.minValue ?? ''}
            onChange={(e) => upd({ minValue: e.target.value === '' ? undefined : Number(e.target.value) })}
            placeholder="min"
            className="bg-transparent border-b border-border focus:outline-none focus:border-accent w-14 text-text"
          />
          <input
            type="number"
            value={cond.maxValue ?? ''}
            onChange={(e) => upd({ maxValue: e.target.value === '' ? undefined : Number(e.target.value) })}
            placeholder="max"
            className="bg-transparent border-b border-border focus:outline-none focus:border-accent w-14 text-text"
          />
        </td>

        {/* Delete */}
        <td className="px-2 py-1.5 text-center">
          <button
            onClick={() => deleteField(fileId, cond.id)}
            className="text-muted hover:text-red-400 transition-colors text-base"
          >
            🗑
          </button>
        </td>
      </tr>

      {showDbPanel && (
        <DbSourcePanel
          cond={cond}
          onSave={(src) => { upd({ dbSource: src }); setShowDbPanel(false) }}
          onClose={() => setShowDbPanel(false)}
        />
      )}
    </>
  )
}

// ─── Records Table ──────────────────────────────────────────────────────────────

interface RecordsTableProps {
  fileId: string
  records: Record<string, unknown>[]
  fields: string[]
}

function RecordsTable({ fileId, records, fields }: RecordsTableProps) {
  const regenerateRecord = useTdStore((s) => s.regenerateRecord)
  const regenerateField  = useTdStore((s) => s.regenerateField)

  if (records.length === 0) return (
    <div className="text-xs text-muted text-center py-8">No records yet — configure fields and click Regenerate Data.</div>
  )

  return (
    <div className="overflow-auto max-h-96 rounded border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface border-b border-border">
          <tr>
            <th className="px-2 py-1.5 text-left text-muted font-medium">#</th>
            {fields.map((f) => (
              <th key={f} className="px-2 py-1.5 text-left text-muted font-medium">{f}</th>
            ))}
            <th className="px-2 py-1.5 text-center text-muted font-medium">Row</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, ri) => (
            <tr key={ri} className="border-b border-border hover:bg-surface/50">
              <td className="px-2 py-1 text-muted">{ri + 1}</td>
              {fields.map((f) => (
                <td key={f} className="px-2 py-1 text-text">
                  <div className="flex items-center gap-1 group">
                    <span className="truncate max-w-[160px]" title={String(rec[f] ?? '')}>
                      {String(rec[f] ?? '—')}
                    </span>
                    <button
                      onClick={() => regenerateField(fileId, ri, f)}
                      title="Regenerate this field"
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent transition-all text-xs"
                    >
                      🔄
                    </button>
                  </div>
                </td>
              ))}
              <td className="px-2 py-1 text-center">
                <button
                  onClick={() => regenerateRecord(fileId, ri)}
                  title="Regenerate this record"
                  className="text-muted hover:text-accent transition-colors"
                >
                  🔄
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Preview Modal ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  fileId: string
}

function PreviewModal({ fileId }: PreviewModalProps) {
  const previewRecords = useTdStore((s) => s.previewRecords)
  const previewStats   = useTdStore((s) => s.previewStats)
  const applyPreview   = useTdStore((s) => s.applyPreview)
  const cancelPreview  = useTdStore((s) => s.cancelPreview)
  const file           = useTdStore((s) => s.files.find((f) => f.id === fileId))

  if (!previewRecords || !file) return null

  const fields = file.conditions.map((c) => c.name)
  const oldFirst = file.records[0]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={cancelPreview}>
      <div
        className="bg-bg border border-border rounded-lg shadow-xl w-[700px] max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-text">🔄 Regenerate Preview</span>
          <button onClick={cancelPreview} className="text-muted hover:text-text text-lg leading-none">×</button>
        </div>

        {/* Stats */}
        {previewStats && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Requested', value: previewStats.requested },
              { label: 'Generated', value: previewStats.generated },
              { label: 'Passed',    value: previewStats.passed },
              { label: 'Duplicates avoided', value: previewStats.duplicatesAvoided },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface border border-border rounded p-2 text-center">
                <div className="text-lg font-bold text-accent">{value}</div>
                <div className="text-xs text-muted">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Side-by-side first-record comparison */}
        {oldFirst && previewRecords[0] && (
          <div>
            <p className="text-xs text-muted mb-1">First-record comparison (old → new):</p>
            <table className="w-full text-xs border border-border rounded overflow-hidden">
              <thead className="bg-surface">
                <tr>
                  <th className="px-2 py-1.5 text-left text-muted font-medium">Field</th>
                  <th className="px-2 py-1.5 text-left text-muted font-medium">Previous</th>
                  <th className="px-2 py-1.5 text-left text-muted font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const prev = String(oldFirst[f] ?? '—')
                  const next = String(previewRecords[0][f] ?? '—')
                  return (
                    <tr key={f} className="border-t border-border">
                      <td className="px-2 py-1 text-muted">{f}</td>
                      <td className="px-2 py-1 text-text">{prev}</td>
                      <td className={cls('px-2 py-1', prev !== next ? 'text-accent font-medium' : 'text-text')}>{next}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t border-border">
          <button
            onClick={() => applyPreview(fileId)}
            className="bg-accent text-white rounded px-4 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
          >
            ✓ Apply New Dataset
          </button>
          <button
            onClick={cancelPreview}
            className="bg-surface border border-border rounded px-3 py-1.5 text-xs text-text hover:border-red-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Version History Panel ──────────────────────────────────────────────────────

interface VersionPanelProps {
  fileId: string
  onClose: () => void
}

function VersionPanel({ fileId, onClose }: VersionPanelProps) {
  const file          = useTdStore((s) => s.files.find((f) => f.id === fileId))
  const restoreVersion = useTdStore((s) => s.restoreVersion)
  const getCompareData = useTdStore((s) => s.getCompareData)

  if (!file) return null
  const compareRows = getCompareData(fileId)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg border border-border rounded-lg shadow-xl w-[600px] max-h-[80vh] overflow-y-auto p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-text">📜 Version History</span>
          <button onClick={onClose} className="text-muted hover:text-text text-lg">×</button>
        </div>

        {file.versions.length === 0 ? (
          <p className="text-xs text-muted">No versions saved yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...file.versions].reverse().map((v) => (
              <div key={v.id} className="bg-surface border border-border rounded p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-text">{v.label}</div>
                  <div className="text-xs text-muted">{new Date(v.createdAt).toLocaleString()} · {v.records.length} records</div>
                </div>
                <button
                  onClick={() => { restoreVersion(fileId, v.id); onClose() }}
                  className="text-xs border border-border rounded px-2 py-1 text-text hover:border-accent transition-colors"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}

        {compareRows.length > 0 && (
          <div>
            <p className="text-xs text-muted mb-1">Compare latest two versions (first record):</p>
            <table className="w-full text-xs border border-border rounded">
              <thead className="bg-surface">
                <tr>
                  <th className="px-2 py-1 text-left text-muted">Field</th>
                  <th className="px-2 py-1 text-left text-muted">Previous</th>
                  <th className="px-2 py-1 text-left text-muted">Current</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.field} className="border-t border-border">
                    <td className="px-2 py-1 text-muted">{row.field}</td>
                    <td className="px-2 py-1 text-text">{row.prev}</td>
                    <td className={cls('px-2 py-1', row.prev !== row.current ? 'text-accent font-medium' : 'text-text')}>{row.current}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function TestDataGenerator() {
  const {
    files, activeFileId, genCount, genMode, genSeed, avoidDuplicates,
    isGenerating, lastError, previewRecords,
    createFile, deleteFile, setActiveFile,
    addField,
    setGenCount, setGenMode, setGenSeed, setAvoidDuplicates,
    previewRegenerate,
    importFromJson,
  } = useTdStore()

  const connections = useDbStore((s) => s.connections)

  const [showVersions, setShowVersions] = useState(false)
  const [importText, setImportText]     = useState('')
  const [showImport, setShowImport]     = useState(false)
  const [customCount, setCustomCount]   = useState('')

  const activeFile = files.find((f) => f.id === activeFileId)

  const handleRegenerate = useCallback(() => {
    if (!activeFileId) return
    previewRegenerate(activeFileId, connections)
  }, [activeFileId, connections, previewRegenerate])

  const resolvedCount = customCount ? parseInt(customCount, 10) || genCount : genCount

  return (
    <div className="flex h-full overflow-hidden bg-bg">
      {/* ── Sidebar: file list ── */}
      <div className="w-56 shrink-0 border-r border-border flex flex-col bg-surface">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-text uppercase tracking-wide">Test Data</span>
          <button
            onClick={() => createFile()}
            title="New file"
            className="text-muted hover:text-accent transition-colors text-lg leading-none"
          >+</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {files.length === 0 && (
            <p className="text-xs text-muted text-center pt-6 px-3">No files yet.<br />Click + to create one.</p>
          )}
          {files.map((f) => (
            <div
              key={f.id}
              onClick={() => setActiveFile(f.id)}
              className={cls(
                'group px-3 py-2 cursor-pointer flex items-center justify-between border-b border-border text-xs',
                f.id === activeFileId ? 'bg-accent/10 text-accent' : 'text-text hover:bg-bg',
              )}
            >
              <span className="truncate flex-1">📄 {f.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteFile(f.id) }}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all ml-1"
              >🗑</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main area ── */}
      {!activeFile ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted gap-3">
          <div className="text-4xl">🧪</div>
          <div className="text-sm font-semibold text-text">Test Data Generator</div>
          <div className="text-xs text-muted">Create a new file or select one from the sidebar.</div>
          <button
            onClick={() => createFile()}
            className="mt-2 bg-accent text-white rounded px-4 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
          >
            + New Test Data File
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header bar */}
          <div className="px-4 py-2.5 border-b border-border bg-surface flex items-center justify-between shrink-0 gap-3 flex-wrap">
            <span className="font-semibold text-sm text-text truncate">📄 {activeFile.name}</span>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Generation mode */}
              <select
                value={genMode}
                onChange={(e) => setGenMode(e.target.value as TdGenerationMode)}
                className="bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
              >
                {GEN_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>

              {/* Count */}
              <select
                value={customCount ? 'custom' : String(genCount)}
                onChange={(e) => {
                  if (e.target.value === 'custom') { setCustomCount('10') }
                  else { setCustomCount(''); setGenCount(Number(e.target.value)) }
                }}
                className="bg-bg border border-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
              >
                {COUNT_OPTIONS.map((n) => <option key={n} value={String(n)}>{n} records</option>)}
                <option value="custom">Custom…</option>
              </select>
              {customCount && (
                <input
                  type="number"
                  value={customCount}
                  onChange={(e) => { setCustomCount(e.target.value); setGenCount(parseInt(e.target.value, 10) || 1) }}
                  className="bg-bg border border-border rounded px-2 py-1 text-xs text-text w-20 focus:outline-none focus:border-accent"
                  min={1}
                />
              )}

              {/* Seed */}
              <input
                type="text"
                value={genSeed}
                onChange={(e) => setGenSeed(e.target.value)}
                placeholder="Seed (auto)"
                className="bg-bg border border-border rounded px-2 py-1 text-xs text-text w-24 focus:outline-none focus:border-accent"
              />

              {/* Avoid duplicates */}
              <label className="flex items-center gap-1 text-xs text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={avoidDuplicates}
                  onChange={(e) => setAvoidDuplicates(e.target.checked)}
                  className="accent-accent"
                />
                Avoid dupes
              </label>

              {/* Version history */}
              <button
                onClick={() => setShowVersions(true)}
                className="border border-border rounded px-2 py-1 text-xs text-muted hover:border-accent hover:text-text transition-colors"
              >
                📜 History
              </button>

              {/* Import */}
              <button
                onClick={() => setShowImport(!showImport)}
                className="border border-border rounded px-2 py-1 text-xs text-muted hover:border-accent hover:text-text transition-colors"
              >
                📥 Import JSON
              </button>

              {/* Regenerate */}
              <button
                onClick={handleRegenerate}
                disabled={isGenerating || activeFile.conditions.length === 0}
                className="bg-accent text-white rounded px-4 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1.5"
              >
                {isGenerating ? '⏳ Generating…' : '🔄 Regenerate Data'}
              </button>
            </div>
          </div>

          {/* Error */}
          {lastError && (
            <div className="px-4 py-2 bg-red-900/20 border-b border-red-500/30 text-xs text-red-400">
              ⚠ {lastError}
            </div>
          )}

          {/* Import panel */}
          {showImport && (
            <div className="px-4 py-3 bg-surface border-b border-border flex gap-2 items-start">
              <textarea
                rows={3}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='Paste JSON array or object — e.g. [{"firstName":"John","age":32}]'
                className="flex-1 bg-bg border border-border rounded px-2 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-accent resize-none"
              />
              <button
                onClick={() => { importFromJson(activeFile.id, importText); setShowImport(false); setImportText('') }}
                className="bg-accent text-white rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
              >
                Import
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
            {/* ── DB-source summary badge ── */}
            {activeFile.conditions.some((c) => c.dbSource?.connectionId) && (
              <div className="flex items-start gap-2 bg-accent/10 border border-accent/30 rounded p-3 text-xs text-accent">
                <span className="text-base leading-none">🗄️</span>
                <div>
                  <span className="font-semibold">DB-sourced fields active. </span>
                  The following fields will pull real values from the database when you regenerate:
                  <span className="ml-1 font-mono">
                    {activeFile.conditions.filter((c) => c.dbSource?.connectionId && c.dbSource?.sql && c.dbSource?.column).map((c) => c.name).join(', ')}
                  </span>
                </div>
              </div>
            )}

            {/* ── Field conditions table ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text uppercase tracking-wide">Fields / Conditions</span>
                <button
                  onClick={() => addField(activeFile.id)}
                  className="text-xs border border-border rounded px-2 py-1 text-muted hover:border-accent hover:text-text transition-colors"
                >
                  + Add Field
                </button>
              </div>

              {activeFile.conditions.length === 0 ? (
                <div className="border border-dashed border-border rounded p-6 text-center text-xs text-muted">
                  No fields yet — click <strong>+ Add Field</strong> or <strong>Import JSON</strong> to get started.
                </div>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface border-b border-border">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-muted font-medium">Field name</th>
                        <th className="px-2 py-1.5 text-left text-muted font-medium">Type</th>
                        <th className="px-2 py-1.5 text-center text-muted font-medium">Req</th>
                        <th className="px-2 py-1.5 text-center text-muted font-medium">Uniq</th>
                        <th className="px-2 py-1.5 text-left text-muted font-medium">DB Source</th>
                        <th className="px-2 py-1.5 text-left text-muted font-medium">Allowed values</th>
                        <th className="px-2 py-1.5 text-left text-muted font-medium">Min / Max</th>
                        <th className="px-2 py-1.5 text-center text-muted font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeFile.conditions.map((cond) => (
                        <FieldRow key={cond.id} fileId={activeFile.id} cond={cond} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Generated records ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text uppercase tracking-wide">
                  Records {activeFile.records.length > 0 ? `(${activeFile.records.length})` : ''}
                </span>
              </div>
              <RecordsTable
                fileId={activeFile.id}
                records={activeFile.records}
                fields={activeFile.conditions.map((c) => c.name)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {previewRecords && activeFileId && <PreviewModal fileId={activeFileId} />}
      {showVersions && activeFileId && <VersionPanel fileId={activeFileId} onClose={() => setShowVersions(false)} />}
    </div>
  )
}
