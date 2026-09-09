import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  ApiRequest,
  AppTab,
  Collection,
  Environment,
  Folder,
  HistoryEntry,
  ResponseData,
  AppSettings,
} from '../types'
import { newRequest, newKV } from '../types'
import { storageService } from '../services/storageService'

interface AppState {
  // Collections / requests / folders
  collections: Collection[]
  requests: ApiRequest[]
  folders: Folder[]

  // Tabs
  tabs: AppTab[]
  activeTabId: string | null

  // Per-tab in-memory cache of unsaved edits.
  // Key = tabId, value = the in-progress ApiRequest for that tab.
  tabEdits: Map<string, ApiRequest>

  // Active request being edited (mirrors the tab)
  activeRequest: ApiRequest | null
  response: ResponseData | null
  isLoading: boolean

  // Environments
  environments: Environment[]
  activeEnvId: string | null

  // History
  history: HistoryEntry[]

  // UI state
  view: 'workspace' | 'dashboard' | 'db' | 'testdata'
  sidebarTab: 'collections' | 'environments' | 'history' | 'db-connections' | 'testdata'
  settings: AppSettings

  // Modals
  showEnvManager: boolean
  showCodeGen: boolean
  showImport: boolean
  showSettings: boolean
  searchOpen: boolean
  searchQuery: string

  // Actions — collections
  createCollection: (name: string) => void
  deleteCollection: (id: string) => void
  renameCollection: (id: string, name: string) => void

  // Actions — folders
  createFolder: (collectionId: string, name: string, parentFolderId?: string) => void
  deleteFolder: (id: string) => void
  renameFolder: (id: string, name: string) => void

  // Actions — requests
  createRequest: (collectionId: string, folderId?: string) => void
  openRequest: (requestId: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateActiveRequest: (patch: Partial<ApiRequest>) => void
  saveActiveRequest: () => void
  duplicateRequest: (requestId: string) => void
  deleteRequest: (requestId: string) => void
  openBlankTab: () => void

  // Response
  setResponse: (r: ResponseData | null) => void
  setLoading: (v: boolean) => void
  // Registered by RequestBuilder so any component can trigger a re-send
  sendFn: (() => void) | null
  registerSendFn: (fn: () => void) => void

  // Environments
  createEnvironment: (name: string) => void
  updateEnvironment: (env: Environment) => void
  deleteEnvironment: (id: string) => void
  setActiveEnv: (id: string | null) => void

  // History
  addHistoryEntry: (entry: HistoryEntry) => void
  clearHistory: () => void

  // UI
  setView: (v: AppState['view']) => void
  setSidebarTab: (t: AppState['sidebarTab'] | string) => void
  setShowEnvManager: (v: boolean) => void
  setShowCodeGen: (v: boolean) => void
  setShowImport: (v: boolean) => void
  setShowSettings: (v: boolean) => void
  setSearchOpen: (v: boolean) => void
  setSearchQuery: (v: string) => void
  updateSettings: (s: Partial<AppSettings>) => void
}

export type { AppState }

function persist(state: Partial<AppState>) {
  if (state.collections) storageService.saveCollections(state.collections)
  if (state.requests) storageService.saveRequests(state.requests)
  if (state.folders) storageService.saveFolders(state.folders)
  if (state.environments) storageService.saveEnvironments(state.environments)
  if (state.history) storageService.saveHistory(state.history)
  if (state.settings) storageService.saveSettings(state.settings)
}

export const useStore = create<AppState>((set, get) => ({
  collections: storageService.getCollections(),
  requests: storageService.getRequests(),
  folders: storageService.getFolders(),
  tabs: [],
  activeTabId: null,
  tabEdits: new Map(),
  activeRequest: null,
  response: null,
  isLoading: false,
  environments: storageService.getEnvironments(),
  activeEnvId: storageService.getActiveEnvId(),
  history: storageService.getHistory(),
  view: 'dashboard',
  sidebarTab: 'collections',
  settings: storageService.getSettings(),
  showEnvManager: false,
  showCodeGen: false,
  showImport: false,
  showSettings: false,
  searchOpen: false,
  searchQuery: '',
  sendFn: null,

  // Collections
  createCollection: (name) => {
    const col: Collection = { id: uuidv4(), name, createdAt: Date.now() }
    const collections = [...get().collections, col]
    set({ collections })
    persist({ collections })
    // auto-create first request
    const req = newRequest({ name: 'New Request', collectionId: col.id, method: 'GET' })
    const requests = [...get().requests, req]
    set({ requests })
    persist({ requests })
  },

  deleteCollection: (id) => {
    const collections = get().collections.filter((c) => c.id !== id)
    const requests = get().requests.filter((r) => r.collectionId !== id)
    const folders = get().folders.filter((f) => f.collectionId !== id)
    // close tabs belonging to this collection
    const tabs = get().tabs.filter((t) => requests.some((r) => r.id === t.requestId))
    const activeTabId = tabs.find((t) => t.id === get().activeTabId) ? get().activeTabId : tabs[tabs.length - 1]?.id ?? null
    // use the already-filtered `requests` array, not the stale get().requests
    const activeRequest = activeTabId ? requests.find((r) => r.id === tabs.find((t) => t.id === activeTabId)?.requestId) ?? null : null
    set({ collections, requests, folders, tabs, activeTabId, activeRequest })
    persist({ collections, requests, folders })
  },

  renameCollection: (id, name) => {
    const collections = get().collections.map((c) => c.id === id ? { ...c, name } : c)
    set({ collections })
    persist({ collections })
  },

  // Folders
  createFolder: (collectionId, name, parentFolderId) => {
    const folder: Folder = { id: uuidv4(), name, collectionId, parentFolderId, expanded: true }
    const folders = [...get().folders, folder]
    set({ folders })
    persist({ folders })
  },

  deleteFolder: (id) => {
    const folders = get().folders.filter((f) => f.id !== id)
    // Also remove all requests that live inside this folder; otherwise they
    // become orphaned (dangling folderId pointing to a deleted folder).
    const requests = get().requests.filter((r) => r.folderId !== id)
    // Close any open tabs for those now-deleted requests.
    const deletedIds = new Set(get().requests.filter((r) => r.folderId === id).map((r) => r.id))
    const tabs = get().tabs.filter((t) => !deletedIds.has(t.requestId))
    const activeTabId = tabs.find((t) => t.id === get().activeTabId) ? get().activeTabId : tabs[tabs.length - 1]?.id ?? null
    const activeRequest = activeTabId ? requests.find((r) => r.id === tabs.find((t) => t.id === activeTabId)?.requestId) ?? null : null
    set({ folders, requests, tabs, activeTabId, activeRequest })
    persist({ folders, requests })
  },

  renameFolder: (id, name) => {
    const folders = get().folders.map((f) => f.id === id ? { ...f, name } : f)
    set({ folders })
    persist({ folders })
  },

  // Requests
  createRequest: (collectionId, folderId) => {
    const req = newRequest({ collectionId, folderId, name: 'New Request' })
    const requests = [...get().requests, req]
    set({ requests })
    persist({ requests })
    get().openRequest(req.id)
  },

  openRequest: (requestId) => {
    const { tabs, tabEdits } = get()
    const existing = tabs.find((t) => t.requestId === requestId)
    if (existing) {
      // Prefer the in-memory (possibly dirty) cached copy so unsaved edits
      // are not discarded when clicking the same request from the sidebar.
      const cached = tabEdits.get(existing.id) ?? null
      const persisted = get().requests.find((r) => r.id === requestId) ?? null
      const req = cached ?? persisted
      set({ activeTabId: existing.id, activeRequest: req, response: null })
      return
    }
    const req = get().requests.find((r) => r.id === requestId)
    if (!req) return
    const tab: AppTab = { id: uuidv4(), requestId, title: req.name, isDirty: false }
    set({
      tabs: [...tabs, tab],
      activeTabId: tab.id,
      activeRequest: { ...req },
      response: null,
      view: 'workspace',
    })
  },

  closeTab: (tabId) => {
    const closingTab = get().tabs.find((t) => t.id === tabId)
    const tabs = get().tabs.filter((t) => t.id !== tabId)
    let activeTabId = get().activeTabId
    let activeRequest = get().activeRequest

    // If the closing tab's request was never saved (collectionId is empty and
    // it only exists in memory — openBlankTab doesn't persist), remove it from
    // the requests array entirely so it doesn't accumulate in localStorage.
    let requests = get().requests
    if (closingTab) {
      const backingReq = requests.find((r) => r.id === closingTab.requestId)
      if (backingReq && backingReq.collectionId === '' && !storageService.getRequests().some((r) => r.id === backingReq.id)) {
        requests = requests.filter((r) => r.id !== closingTab.requestId)
      }
    }

    if (activeTabId === tabId) {
      const newActive = tabs[tabs.length - 1] ?? null
      activeTabId = newActive?.id ?? null
      // Prefer the in-memory (possibly dirty) copy so unsaved edits on the
      // revealed tab are preserved.  Fall back to the persisted store copy.
      if (newActive) {
        const currentlyActive = get().activeRequest
        const isAlreadyActive = currentlyActive?.id === newActive.requestId
        activeRequest = isAlreadyActive
          ? currentlyActive
          : requests.find((r) => r.id === newActive.requestId) ?? null
      } else {
        activeRequest = null
      }
    }
    set({ tabs, activeTabId, activeRequest, response: null, requests })
  },

  setActiveTab: (tabId) => {
    const { tabs, activeTabId, activeRequest, tabEdits } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    // Save the current in-memory state into the cache before switching away.
    if (activeTabId && activeRequest) {
      tabEdits.set(activeTabId, activeRequest)
    }

    // Restore cached edits for the incoming tab, or fall back to the persisted copy.
    const cached = tabEdits.get(tabId) ?? null
    const persisted = get().requests.find((r) => r.id === tab.requestId) ?? null
    const req = cached ?? (persisted ? { ...persisted } : null)

    set({ activeTabId: tabId, activeRequest: req, response: null })
  },

  updateActiveRequest: (patch) => {
    const { activeRequest, tabs, activeTabId, tabEdits } = get()
    if (!activeRequest) return
    const updated = { ...activeRequest, ...patch, updatedAt: Date.now() }
    const newTabs = tabs.map((t) =>
      t.id === activeTabId ? { ...t, title: (patch.name ?? t.title), isDirty: true } : t
    )
    // Keep the tab cache in sync so switching away and back preserves the edit.
    if (activeTabId) tabEdits.set(activeTabId, updated)
    set({ activeRequest: updated, tabs: newTabs })
  },

  saveActiveRequest: () => {
    const { activeRequest, tabs, activeTabId, tabEdits } = get()
    if (!activeRequest) return

    // A blank tab request (collectionId='') needs to be upserted, not just mapped.
    const existingIdx = get().requests.findIndex((r) => r.id === activeRequest.id)
    const requests = existingIdx >= 0
      ? get().requests.map((r) => r.id === activeRequest.id ? { ...activeRequest } : r)
      : [...get().requests, { ...activeRequest }]

    const newTabs = tabs.map((t) => t.id === activeTabId ? { ...t, isDirty: false } : t)
    // Clear the cache entry — it's now persisted.
    if (activeTabId) tabEdits.delete(activeTabId)
    set({ requests, tabs: newTabs })
    persist({ requests })
  },

  duplicateRequest: (requestId) => {
    const original = get().requests.find((r) => r.id === requestId)
    if (!original) return
    const dup = { ...original, id: uuidv4(), name: `${original.name} Copy`, createdAt: Date.now(), updatedAt: Date.now() }
    const requests = [...get().requests, dup]
    set({ requests })
    persist({ requests })
    get().openRequest(dup.id)
  },

  deleteRequest: (requestId) => {
    const requests = get().requests.filter((r) => r.id !== requestId)
    const tabs = get().tabs.filter((t) => t.requestId !== requestId)
    const activeTabId = tabs.find((t) => t.id === get().activeTabId) ? get().activeTabId : tabs[tabs.length - 1]?.id ?? null
    // use the already-filtered `requests` array, not the stale get().requests
    const activeRequest = activeTabId ? requests.find((r) => r.id === tabs.find((t) => t.id === activeTabId)?.requestId) ?? null : null
    set({ requests, tabs, activeTabId, activeRequest })
    persist({ requests })
  },

  openBlankTab: () => {
    const req = newRequest({ name: 'New Request', collectionId: '' })
    // Do NOT persist yet — the request is unsaved until the user hits Save.
    // openRequest will add it to the in-memory requests array and open a tab.
    const requests = [...get().requests, req]
    set({ requests })
    get().openRequest(req.id)
  },

  // Response
  setResponse: (r) => set({ response: r }),
  setLoading: (v) => set({ isLoading: v }),
  registerSendFn: (fn) => set({ sendFn: fn }),

  // Environments
  createEnvironment: (name) => {
    const env: Environment = { id: uuidv4(), name, variables: [], createdAt: Date.now() }
    const environments = [...get().environments, env]
    set({ environments })
    persist({ environments })
  },

  updateEnvironment: (env) => {
    const environments = get().environments.map((e) => e.id === env.id ? env : e)
    set({ environments })
    persist({ environments })
  },

  deleteEnvironment: (id) => {
    const environments = get().environments.filter((e) => e.id !== id)
    const activeEnvId = get().activeEnvId === id ? null : get().activeEnvId
    set({ environments, activeEnvId })
    persist({ environments })
    storageService.setActiveEnvId(activeEnvId)
  },

  setActiveEnv: (id) => {
    set({ activeEnvId: id })
    storageService.setActiveEnvId(id)
  },

  // History
  addHistoryEntry: (entry) => {
    const history = [entry, ...get().history].slice(0, 500)
    set({ history })
    persist({ history })
  },

  clearHistory: () => {
    set({ history: [] })
    persist({ history: [] })
  },

  // UI
  setView: (v) => set({ view: v }),
  setSidebarTab: (t) => set({ sidebarTab: t as AppState['sidebarTab'] }),
  setShowEnvManager: (v) => set({ showEnvManager: v }),
  setShowCodeGen: (v) => set({ showCodeGen: v }),
  setShowImport: (v) => set({ showImport: v }),
  setShowSettings: (v) => set({ showSettings: v }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setSearchQuery: (v) => set({ searchQuery: v }),

  updateSettings: (s) => {
    const settings = { ...get().settings, ...s }
    set({ settings })
    persist({ settings })
  },
}))
