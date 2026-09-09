import type {
  ApiRequest,
  Collection,
  Environment,
  EnvironmentVariable,
  Folder,
  HistoryEntry,
  AppSettings,
} from '../types'

const KEYS = {
  collections: 'api_collections',
  requests: 'api_requests',
  folders: 'api_folders',
  environments: 'api_environments',
  history: 'api_history',
  settings: 'api_settings',
  activeEnv: 'api_active_env',
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export const storageService = {
  // Collections
  getCollections: (): Collection[] => load<Collection[]>(KEYS.collections, []),
  saveCollections: (cols: Collection[]) => save(KEYS.collections, cols),

  // Requests
  getRequests: (): ApiRequest[] => load<ApiRequest[]>(KEYS.requests, []),
  saveRequests: (reqs: ApiRequest[]) => save(KEYS.requests, reqs),

  // Folders
  getFolders: (): Folder[] => load<Folder[]>(KEYS.folders, []),
  saveFolders: (folders: Folder[]) => save(KEYS.folders, folders),

  // Environments
  getEnvironments: (): Environment[] => load<Environment[]>(KEYS.environments, []),
  saveEnvironments: (envs: Environment[]) => save(KEYS.environments, envs),

  // History
  getHistory: (): HistoryEntry[] => load<HistoryEntry[]>(KEYS.history, []),
  saveHistory: (h: HistoryEntry[]) => save(KEYS.history, h.slice(0, 500)),
  addHistory: (entry: HistoryEntry) => {
    const h = load<HistoryEntry[]>(KEYS.history, [])
    save(KEYS.history, [entry, ...h].slice(0, 500))
  },

  // Settings
  getSettings: (): AppSettings =>
    load<AppSettings>(KEYS.settings, {
      proxyUrl: 'http://localhost:4001',
      useProxy: false,
      requestTimeout: 30000,
      followRedirects: true,
      sslVerify: true,
    }),
  saveSettings: (s: AppSettings) => save(KEYS.settings, s),

  // Active env
  getActiveEnvId: (): string | null => localStorage.getItem(KEYS.activeEnv),
  setActiveEnvId: (id: string | null) => {
    if (id) localStorage.setItem(KEYS.activeEnv, id)
    else localStorage.removeItem(KEYS.activeEnv)
  },
}
