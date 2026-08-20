import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { TdTestDataFile, TdFieldCondition, TdGenerationMode, DbConnection } from '../types'
import { newTdFile, newTdField } from '../types'
import { generateTestData, generateTestDataAsync, inferConditionsFromData } from '../utils/testDataEngine'

const STORAGE_KEY = 'td_files_v1'

function loadFiles(): TdTestDataFile[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

function saveFiles(files: TdTestDataFile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
}

export interface TdStore {
  files: TdTestDataFile[]
  activeFileId: string | null

  // generation settings
  genCount: number
  genMode: TdGenerationMode
  genSeed: string // 'auto' or a numeric string
  avoidDuplicates: boolean

  // preview state
  previewRecords: Record<string, unknown>[] | null
  previewStats: { requested: number; generated: number; passed: number; failed: number; duplicatesAvoided: number } | null

  // generation state
  isGenerating: boolean
  lastError: string | null

  // Actions — files
  createFile: (name?: string) => TdTestDataFile
  saveFile: (file: TdTestDataFile) => void
  deleteFile: (id: string) => void
  setActiveFile: (id: string | null) => void

  // Actions — conditions
  addField: (fileId: string) => void
  updateField: (fileId: string, field: TdFieldCondition) => void
  deleteField: (fileId: string, fieldId: string) => void

  // Actions — generation
  setGenCount: (n: number) => void
  setGenMode: (m: TdGenerationMode) => void
  setGenSeed: (s: string) => void
  setAvoidDuplicates: (v: boolean) => void

  // Preview + Apply
  previewRegenerate: (fileId: string, connections?: DbConnection[]) => void
  applyPreview: (fileId: string) => void
  cancelPreview: () => void

  // Regenerate single record
  regenerateRecord: (fileId: string, recordIndex: number) => void

  // Regenerate single field
  regenerateField: (fileId: string, recordIndex: number, fieldName: string) => void

  // Import from JSON
  importFromJson: (fileId: string, json: string) => void

  // Compare: returns { prev, current } side-by-side rows for latest two versions
  getCompareData: (fileId: string) => { field: string; prev: string; current: string }[]

  // Restore version
  restoreVersion: (fileId: string, versionId: string) => void
}

export const useTdStore = create<TdStore>((set, get) => ({
  files: loadFiles(),
  activeFileId: null,
  genCount: 10,
  genMode: 'random',
  genSeed: 'auto',
  avoidDuplicates: true,
  previewRecords: null,
  previewStats: null,
  isGenerating: false,
  lastError: null,

  // ─── File operations ──────────────────────────────────────────────────────────

  createFile: (name = 'New Test Data') => {
    const file = newTdFile({ name })
    const files = [...get().files, file]
    set({ files, activeFileId: file.id })
    saveFiles(files)
    return file
  },

  saveFile: (file) => {
    const updated = { ...file, updatedAt: Date.now() }
    const existing = get().files.find((f) => f.id === file.id)
    const files = existing
      ? get().files.map((f) => (f.id === file.id ? updated : f))
      : [...get().files, updated]
    set({ files })
    saveFiles(files)
  },

  deleteFile: (id) => {
    const files = get().files.filter((f) => f.id !== id)
    const activeFileId = get().activeFileId === id ? (files[0]?.id ?? null) : get().activeFileId
    set({ files, activeFileId })
    saveFiles(files)
  },

  setActiveFile: (id) => set({ activeFileId: id }),

  // ─── Field / condition editing ────────────────────────────────────────────────

  addField: (fileId) => {
    const files = get().files.map((f) => {
      if (f.id !== fileId) return f
      const field = newTdField({ name: `field${f.conditions.length + 1}` })
      return { ...f, conditions: [...f.conditions, field], updatedAt: Date.now() }
    })
    set({ files })
    saveFiles(files)
  },

  updateField: (fileId, field) => {
    const files = get().files.map((f) => {
      if (f.id !== fileId) return f
      const conditions = f.conditions.map((c) => (c.id === field.id ? field : c))
      return { ...f, conditions, updatedAt: Date.now() }
    })
    set({ files })
    saveFiles(files)
  },

  deleteField: (fileId, fieldId) => {
    const files = get().files.map((f) => {
      if (f.id !== fileId) return f
      return { ...f, conditions: f.conditions.filter((c) => c.id !== fieldId), updatedAt: Date.now() }
    })
    set({ files })
    saveFiles(files)
  },

  // ─── Generation settings ──────────────────────────────────────────────────────

  setGenCount: (n) => set({ genCount: n }),
  setGenMode: (m) => set({ genMode: m }),
  setGenSeed: (s) => set({ genSeed: s }),
  setAvoidDuplicates: (v) => set({ avoidDuplicates: v }),

  // ─── Preview + Apply ──────────────────────────────────────────────────────────

  previewRegenerate: async (fileId, connections = []) => {
    const file = get().files.find((f) => f.id === fileId)
    if (!file || file.conditions.length === 0) return
    set({ isGenerating: true, lastError: null })
    try {
      const seed = get().genSeed === 'auto' ? undefined : parseInt(get().genSeed, 10)
      const opts = {
        count: get().genCount,
        mode: get().genMode,
        seed,
        avoidDuplicates: get().avoidDuplicates,
        existingRecords: file.records,
      }
      // Use async variant only when at least one field has a DB source
      const hasDbSource = file.conditions.some((c) => c.dbSource?.connectionId && c.dbSource?.sql && c.dbSource?.column)
      const result = hasDbSource
        ? await generateTestDataAsync(file.conditions, opts, connections)
        : generateTestData(file.conditions, opts)
      set({ previewRecords: result.records, previewStats: result.stats })
    } catch (e) {
      set({ lastError: (e as Error).message })
    } finally {
      set({ isGenerating: false })
    }
  },

  applyPreview: (fileId) => {
    const { previewRecords } = get()
    if (!previewRecords) return
    const file = get().files.find((f) => f.id === fileId)
    if (!file) return

    // Only snapshot the current records as a version if they are non-empty —
    // snapshotting an empty set would create a useless "Version 1: 0 records" entry.
    const shouldSnapshot = file.records.length > 0
    const version = shouldSnapshot ? {
      id: uuidv4(),
      label: `Version ${file.versions.length + 1}`,
      records: file.records,
      createdAt: Date.now(),
    } : null
    const updatedFile = {
      ...file,
      records: previewRecords,
      versions: version ? [...file.versions, version] : file.versions,
      updatedAt: Date.now(),
    }
    const files = get().files.map((f) => (f.id === fileId ? updatedFile : f))
    set({ files, previewRecords: null, previewStats: null })
    saveFiles(files)
  },

  cancelPreview: () => set({ previewRecords: null, previewStats: null }),

  // ─── Regenerate single record ─────────────────────────────────────────────────

  regenerateRecord: (fileId, recordIndex) => {
    const file = get().files.find((f) => f.id === fileId)
    if (!file) return
    const seed = get().genSeed === 'auto' ? undefined : parseInt(get().genSeed, 10)
    const result = generateTestData(file.conditions, {
      count: 1,
      mode: get().genMode,
      seed,
      avoidDuplicates: get().avoidDuplicates,
      existingRecords: file.records.filter((_, i) => i !== recordIndex),
    })
    if (!result.records.length) return
    const records = file.records.map((r, i) => (i === recordIndex ? result.records[0] : r))
    const updatedFile = { ...file, records, updatedAt: Date.now() }
    const files = get().files.map((f) => (f.id === fileId ? updatedFile : f))
    set({ files })
    saveFiles(files)
  },

  // ─── Regenerate single field ──────────────────────────────────────────────────

  regenerateField: (fileId, recordIndex, fieldName) => {
    const file = get().files.find((f) => f.id === fileId)
    if (!file) return
    const cond = file.conditions.find((c) => c.name === fieldName)
    if (!cond) return
    const seed = get().genSeed === 'auto' ? undefined : parseInt(get().genSeed, 10)
    const result = generateTestData([cond], {
      count: 1,
      mode: get().genMode,
      seed,
      avoidDuplicates: false,
    })
    if (!result.records.length) return
    const newVal = result.records[0][fieldName]
    const records = file.records.map((r, i) => (i === recordIndex ? { ...r, [fieldName]: newVal } : r))
    const updatedFile = { ...file, records, updatedAt: Date.now() }
    const files = get().files.map((f) => (f.id === fileId ? updatedFile : f))
    set({ files })
    saveFiles(files)
  },

  // ─── Import from JSON ─────────────────────────────────────────────────────────

  importFromJson: (fileId, json) => {
    try {
      const parsed = JSON.parse(json)
      const data: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed]
      const conditions = inferConditionsFromData(data)
      const files = get().files.map((f) => {
        if (f.id !== fileId) return f
        return { ...f, conditions, records: data, updatedAt: Date.now() }
      })
      set({ files, lastError: null })
      saveFiles(files)
    } catch (e) {
      set({ lastError: `JSON parse error: ${(e as Error).message}` })
    }
  },

  // ─── Compare ──────────────────────────────────────────────────────────────────

  getCompareData: (fileId) => {
    const file = get().files.find((f) => f.id === fileId)
    if (!file || file.versions.length === 0 || file.records.length === 0) return []
    const prevVersion = file.versions[file.versions.length - 1]
    const fields = file.conditions.map((c) => c.name)
    return fields.map((field) => ({
      field,
      prev: String(prevVersion.records[0]?.[field] ?? '—'),
      current: String(file.records[0]?.[field] ?? '—'),
    }))
  },

  // ─── Restore version ──────────────────────────────────────────────────────────

  restoreVersion: (fileId, versionId) => {
    const file = get().files.find((f) => f.id === fileId)
    if (!file) return
    const version = file.versions.find((v) => v.id === versionId)
    if (!version) return
    // Push current as new version (1-based)
    const currentVersion = { id: uuidv4(), label: `Version ${file.versions.length + 1}`, records: file.records, createdAt: Date.now() }
    const updatedFile = {
      ...file,
      records: version.records,
      versions: [...file.versions, currentVersion],
      updatedAt: Date.now(),
    }
    const files = get().files.map((f) => (f.id === fileId ? updatedFile : f))
    set({ files })
    saveFiles(files)
  },
}))
