import type { DbConnection, SavedQuery, DbQueryHistoryEntry } from '../types'

const KEYS = {
  connections: 'db_connections',
  queries: 'db_saved_queries',
  history: 'db_query_history',
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

export const dbStorageService = {
  // Connections
  getConnections: (): DbConnection[] => load<DbConnection[]>(KEYS.connections, []),
  saveConnections: (items: DbConnection[]) => save(KEYS.connections, items),

  // Saved queries
  getQueries: (): SavedQuery[] => load<SavedQuery[]>(KEYS.queries, []),
  saveQueries: (items: SavedQuery[]) => save(KEYS.queries, items),

  // Query execution history
  getHistory: (): DbQueryHistoryEntry[] => load<DbQueryHistoryEntry[]>(KEYS.history, []),
  saveHistory: (items: DbQueryHistoryEntry[]) => save(KEYS.history, items.slice(0, 200)),
  addHistory: (entry: DbQueryHistoryEntry) => {
    const h = load<DbQueryHistoryEntry[]>(KEYS.history, [])
    save(KEYS.history, [entry, ...h].slice(0, 200))
  },
}
