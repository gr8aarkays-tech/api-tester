import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  DbConnection,
  SavedQuery,
  DbQueryResult,
  DbVariables,
  DbQueryHistoryEntry,
  DataDrivenResult,
  DbExecutionMode,
} from '../types'
import { newDbConnection, newSavedQuery } from '../types'
import { dbStorageService } from '../services/dbStorageService'
import { testConnection, runQuery, buildDbVariables } from '../services/dbClient'

export interface DbState {
  // Data
  connections: DbConnection[]
  savedQueries: SavedQuery[]
  queryHistory: DbQueryHistoryEntry[]

  // Active query session
  activeConnectionId: string | null
  activeQueryId: string | null
  activeSql: string
  queryResult: DbQueryResult | null
  isRunningQuery: boolean

  // Resolved DB variables (shared across requests)
  dbVariables: DbVariables
  executionMode: DbExecutionMode
  selectedRowIndex: number

  // Connection test state
  testingConnectionId: string | null
  /** ID of the last connection that was tested, so the result can be shown on the right form */
  lastTestedConnectionId: string | null
  testResult: { success: boolean; message: string } | null

  // Data-driven run results
  dataDrivenResults: DataDrivenResult[]

  // Backend availability
  backendOnline: boolean

  // UI
  dbView: 'connections' | 'query-editor' | 'query-library' | 'query-history' | 'workflow'

  // Actions
  setDbView: (v: DbState['dbView']) => void
  setBackendOnline: (v: boolean) => void

  // Connections
  createConnection: () => DbConnection
  saveConnection: (conn: DbConnection) => void
  deleteConnection: (id: string) => void
  testDbConnection: (conn: DbConnection) => Promise<void>

  // Queries
  createQuery: (partial?: Partial<SavedQuery>) => SavedQuery
  saveQuery: (q: SavedQuery) => void
  deleteQuery: (id: string) => void

  // Query execution
  setActiveSql: (sql: string) => void
  setActiveConnection: (id: string | null) => void
  setActiveQuery: (id: string | null) => void
  runActiveQuery: (params?: Record<string, unknown>) => Promise<void>
  clearQueryResult: () => void

  // Variables
  setDbVariables: (vars: DbVariables) => void
  setExecutionMode: (mode: DbExecutionMode) => void
  setSelectedRowIndex: (idx: number) => void

  // History
  clearQueryHistory: () => void

  // Data-driven
  setDataDrivenResults: (results: DataDrivenResult[]) => void
  clearDataDrivenResults: () => void
}

export const useDbStore = create<DbState>((set, get) => ({
  connections: dbStorageService.getConnections(),
  savedQueries: dbStorageService.getQueries(),
  queryHistory: dbStorageService.getHistory(),
  activeConnectionId: null,
  activeQueryId: null,
  activeSql: '-- Write your SQL query here\nSELECT * FROM ',
  queryResult: null,
  isRunningQuery: false,
  dbVariables: {},
  executionMode: 'first-row',
  selectedRowIndex: 0,
  testingConnectionId: null,
  lastTestedConnectionId: null,
  testResult: null,
  dataDrivenResults: [],
  backendOnline: false,
  dbView: 'connections',

  setDbView: (v) => set({ dbView: v }),
  setBackendOnline: (v) => set({ backendOnline: v }),

  // Connections
  createConnection: () => {
    const conn = newDbConnection()
    return conn
  },

  saveConnection: (conn) => {
    const updated = { ...conn, updatedAt: Date.now() }
    const existing = get().connections.find((c) => c.id === conn.id)
    const connections = existing
      ? get().connections.map((c) => (c.id === conn.id ? updated : c))
      : [...get().connections, updated]
    set({ connections })
    dbStorageService.saveConnections(connections)
  },

  deleteConnection: (id) => {
    const connections = get().connections.filter((c) => c.id !== id)
    set({ connections, activeConnectionId: get().activeConnectionId === id ? null : get().activeConnectionId })
    dbStorageService.saveConnections(connections)
  },

  testDbConnection: async (conn) => {
    set({ testingConnectionId: conn.id, testResult: null })
    try {
      const result = await testConnection(conn)
      set({ testResult: result, lastTestedConnectionId: conn.id })
    } catch (e) {
      set({ testResult: { success: false, message: (e as Error).message }, lastTestedConnectionId: conn.id })
    } finally {
      set({ testingConnectionId: null })
    }
  },

  // Queries
  createQuery: (partial) => {
    const q = newSavedQuery(partial)
    return q
  },

  saveQuery: (q) => {
    const updated = { ...q, updatedAt: Date.now() }
    const existing = get().savedQueries.find((sq) => sq.id === q.id)
    const savedQueries = existing
      ? get().savedQueries.map((sq) => (sq.id === q.id ? updated : sq))
      : [...get().savedQueries, updated]
    set({ savedQueries })
    dbStorageService.saveQueries(savedQueries)
  },

  deleteQuery: (id) => {
    const savedQueries = get().savedQueries.filter((q) => q.id !== id)
    set({ savedQueries })
    dbStorageService.saveQueries(savedQueries)
  },

  // Query execution
  setActiveSql: (sql) => set({ activeSql: sql }),
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  setActiveQuery: (id) => {
    const q = get().savedQueries.find((sq) => sq.id === id) ?? null
    set({
      activeQueryId: id,
      activeSql: q?.sql ?? get().activeSql,
      activeConnectionId: q?.connectionId || get().activeConnectionId,
    })
  },

  runActiveQuery: async (params) => {
    const { activeConnectionId, activeSql, connections, savedQueries, activeQueryId } = get()
    const conn = connections.find((c) => c.id === activeConnectionId)
    if (!conn) return
    set({ isRunningQuery: true, queryResult: null })
    const start = Date.now()
    try {
      const result = await runQuery({ connection: conn, sql: activeSql, params })
      set({ queryResult: result })

      // Resolve variables from first row
      const vars = buildDbVariables(result, get().selectedRowIndex)
      set({ dbVariables: vars })

      // Persist to query history — use the server-reported executionTime so the
      // history reflects actual DB execution time, not round-trip latency.
      const queryName = savedQueries.find((q) => q.id === activeQueryId)?.name ?? 'Ad-hoc Query'
      const entry: DbQueryHistoryEntry = {
        id: uuidv4(),
        queryName,
        connectionName: conn.name,
        sql: activeSql,
        connectionId: conn.id,
        timestamp: Date.now(),
        rowCount: result.rowCount,
        executionTime: result.executionTime,
        error: result.error,
      }
      const queryHistory = [entry, ...get().queryHistory].slice(0, 200)
      set({ queryHistory })
      dbStorageService.saveHistory(queryHistory)
    } catch (e) {
      const err = (e as Error).message
      set({ queryResult: { columns: [], rows: [], rowCount: 0, executionTime: Date.now() - start, error: err } })
    } finally {
      set({ isRunningQuery: false })
    }
  },

  clearQueryResult: () => set({ queryResult: null }),

  // Variables
  setDbVariables: (vars) => set({ dbVariables: vars }),
  setExecutionMode: (mode) => set({ executionMode: mode }),
  setSelectedRowIndex: (idx) => {
    const { queryResult } = get()
    if (!queryResult) return
    const vars = buildDbVariables(queryResult, idx)
    set({ selectedRowIndex: idx, dbVariables: vars })
  },

  // History
  clearQueryHistory: () => {
    set({ queryHistory: [] })
    dbStorageService.saveHistory([])
  },

  // Data-driven
  setDataDrivenResults: (results) => set({ dataDrivenResults: results }),
  clearDataDrivenResults: () => set({ dataDrivenResults: [] }),
}))
