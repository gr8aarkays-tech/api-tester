import { v4 as uuidv4 } from 'uuid'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
export type ApiType = 'REST' | 'SOAP'
export type BodyType = 'none' | 'json' | 'xml' | 'form-data' | 'urlencoded' | 'raw' | 'binary'
export type AuthType = 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2'

export interface KeyValueItem {
  id: string
  key: string
  value: string
  description?: string
  enabled: boolean
}

export function newKV(key = '', value = '', desc = ''): KeyValueItem {
  return { id: uuidv4(), key, value, description: desc, enabled: true }
}

export interface AuthConfig {
  type: AuthType
  username?: string
  password?: string
  token?: string
  apiKeyName?: string
  apiKeyValue?: string
  apiKeyIn?: 'header' | 'query'
  oauth2Token?: string
}

export interface TestAssertion {
  id: string
  type: 'status' | 'responseTime' | 'headerExists' | 'headerEquals' | 'jsonField' | 'contains'
  enabled: boolean
  // status
  statusCode?: number
  // responseTime
  maxMs?: number
  // header
  headerName?: string
  headerValue?: string
  // json field
  jsonPath?: string
  operator?: 'exists' | 'equals' | 'contains' | 'notEmpty'
  expectedValue?: string
  // contains
  searchText?: string
}

export interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  apiType: ApiType
  params: KeyValueItem[]
  headers: KeyValueItem[]
  auth: AuthConfig
  bodyType: BodyType
  bodyJson: string
  bodyXml: string
  bodyFormData: KeyValueItem[]
  bodyUrlEncoded: KeyValueItem[]
  bodyRaw: string
  tests: TestAssertion[]
  folderId?: string
  collectionId: string
  createdAt: number
  updatedAt: number
}

export function newRequest(partial?: Partial<ApiRequest>): ApiRequest {
  return {
    id: uuidv4(),
    name: 'New Request',
    method: 'GET',
    url: '',
    apiType: 'REST',
    params: [],
    headers: [newKV('Content-Type', 'application/json'), newKV('Accept', 'application/json')],
    auth: { type: 'none' },
    bodyType: 'none',
    bodyJson: '{\n  \n}',
    bodyXml: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  \n</root>',
    bodyFormData: [],
    bodyUrlEncoded: [],
    bodyRaw: '',
    tests: [],
    collectionId: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  }
}

export interface Folder {
  id: string
  name: string
  collectionId: string
  parentFolderId?: string
  expanded: boolean
}

export interface Collection {
  id: string
  name: string
  description?: string
  createdAt: number
}

export interface EnvironmentVariable {
  id: string
  key: string
  value: string
  secret: boolean
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  variables: EnvironmentVariable[]
  createdAt: number
}

export interface HistoryEntry {
  id: string
  request: Omit<ApiRequest, 'tests'>
  status: number
  statusText: string
  responseTime: number
  responseSize: number
  timestamp: number
}

export interface TestResult {
  name: string
  passed: boolean
  message?: string
}

export interface ResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  responseTime: number
  size: number
  testResults: TestResult[]
  error?: string
}

export interface AppTab {
  id: string
  requestId: string
  title: string
  isDirty: boolean
}

export interface AppSettings {
  proxyUrl: string
  useProxy: boolean
  proxyMode: 'local' | 'public'
  publicProxyUrl?: string
  corsApiKey?: string
  requestTimeout: number
  followRedirects: boolean
  sslVerify: boolean
}

// ─── Database types ────────────────────────────────────────────────────────────

export type DbType = 'postgresql' | 'mysql' | 'oracle' | 'mssql' | 'sqlite'

export interface DbConnection {
  id: string
  name: string
  dbType: DbType
  host: string
  port: number
  database: string
  username: string
  /** never store plaintext in prod – for local tool use only */
  password: string
  schema?: string
  /** env-specific: map envId → connectionId override */
  envOverrides?: Record<string, string>
  createdAt: number
  updatedAt: number
}

export function newDbConnection(partial?: Partial<DbConnection>): DbConnection {
  return {
    id: uuidv4(),
    name: 'New Connection',
    dbType: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: '',
    schema: '',
    envOverrides: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  }
}

export interface SavedQuery {
  id: string
  name: string
  connectionId: string
  sql: string
  description?: string
  category?: string
  createdBy?: string
  createdAt: number
  updatedAt: number
}

export function newSavedQuery(partial?: Partial<SavedQuery>): SavedQuery {
  return {
    id: uuidv4(),
    name: 'New Query',
    connectionId: '',
    sql: 'SELECT * FROM ',
    description: '',
    category: 'General',
    createdBy: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  }
}

export interface DbQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  executionTime: number
  error?: string
}

export interface DbVariable {
  column: string
  value: unknown
}

/** Variables resolved from a DB query result, accessible as {{db.COLUMN}} */
export type DbVariables = Record<string, unknown>

export interface DbQueryHistoryEntry {
  id: string
  queryName: string
  connectionName: string
  sql: string
  connectionId: string
  timestamp: number
  rowCount: number
  executionTime: number
  error?: string
}

export type DbDataMode = 'manual' | 'fetch-before' | 'fetch-once' | 'fetch-every' | 'data-driven'

export type DbExecutionMode = 'first-row' | 'selected-row' | 'all-rows'

/** Stored per-request database config */
export interface RequestDbConfig {
  connectionId: string
  queryId: string
  dataMode: DbDataMode
  executionMode: DbExecutionMode
  selectedRowIndex: number
}

export function newRequestDbConfig(): RequestDbConfig {
  return {
    connectionId: '',
    queryId: '',
    dataMode: 'manual',
    executionMode: 'first-row',
    selectedRowIndex: 0,
  }
}

export interface DbAssertion {
  id: string
  enabled: boolean
  connectionId: string
  sql: string
  operator: 'equals' | 'notEquals' | 'contains' | 'notEmpty' | 'greaterThan' | 'lessThan' | 'rowCount' | 'jsonFieldVsDb'
  expectedValue: string
  /** JSON path in API response for jsonFieldVsDb */
  jsonPath?: string
}

export interface DataDrivenResult {
  iteration: number
  variables: DbVariables
  status: number
  statusText: string
  responseTime: number
  passed: boolean
  error?: string
}

// ─── Test Data Generator types ────────────────────────────────────────────────

export type TdFieldType =
  | 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime'
  | 'email' | 'phone' | 'uuid' | 'enum' | 'regex' | 'custom'

export type TdGenerationMode = 'random' | 'unique' | 'sequential' | 'boundary' | 'negative' | 'mixed'

export interface TdFieldDependency {
  /** when THIS field has `value`, set `targetField` to value produced by `targetExpr` */
  triggerValue: string
  targetField: string
  /** JS expression string or plain value — e.g. "amount >= 20000" or "India" */
  targetExpr: string
}

/**
 * Optional database source for a field.
 * When set the test-data engine executes `sql` against `connectionId`
 * and picks the value from `column` in a random result row.
 *
 * Example:
 *   connectionId = "conn-abc"
 *   sql          = "SELECT firstName FROM users WHERE status = 'ACTIVE'"
 *   column       = "firstName"
 *
 * `pickMode`:
 *   "random"     – pick a random row from the result set (default)
 *   "sequential" – cycle through rows in order
 *   "first"      – always use the first row
 */
export interface TdFieldDbSource {
  connectionId: string
  sql: string
  column: string
  pickMode?: 'random' | 'sequential' | 'first'
}

export interface TdFieldCondition {
  id: string
  name: string
  type: TdFieldType
  required: boolean
  unique: boolean
  /** enum: comma-separated or array */
  allowedValues?: string[]
  minValue?: number
  maxValue?: number
  minLength?: number
  maxLength?: number
  regex?: string
  format?: string
  /** e.g. "C{5d}" where {5d} = 5 digits */
  pattern?: string
  defaultValue?: string
  dependencies?: TdFieldDependency[]
  /** When set, field value is resolved from a live DB query instead of generated */
  dbSource?: TdFieldDbSource
}

export interface TdDatasetVersion {
  id: string
  label: string
  records: Record<string, unknown>[]
  createdAt: number
}

export interface TdTestDataFile {
  id: string
  name: string
  /** field schema/conditions */
  conditions: TdFieldCondition[]
  /** active (latest) records */
  records: Record<string, unknown>[]
  /** version history */
  versions: TdDatasetVersion[]
  createdAt: number
  updatedAt: number
}

export type TdValidationResult = {
  passed: boolean
  recordIndex: number
  field: string
  rule: string
  message: string
}

export function newTdField(partial?: Partial<TdFieldCondition>): TdFieldCondition {
  return {
    id: uuidv4(),
    name: 'field',
    type: 'string',
    required: true,
    unique: false,
    ...partial,
  }
}

export function newTdFile(partial?: Partial<TdTestDataFile>): TdTestDataFile {
  const now = Date.now()
  return {
    id: uuidv4(),
    name: 'New Test Data',
    conditions: [],
    records: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}
