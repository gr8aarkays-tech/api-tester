/**
 * API Tester – Backend Server
 *
 * Provides:
 *   POST /db/test          – Test a DB connection
 *   POST /db/query         – Execute a SQL query
 *   POST /db/query-values  – Fetch column values for Test Data Generator
 *   POST /proxy            – Proxy HTTP requests (CORS bypass)
 *   GET  /health           – Health check
 *
 * Database credentials are handled exclusively on this server and never
 * returned to the browser frontend.
 *
 * Start: node index.js  (or: npm run dev)
 * Default port: 4001
 *
 * Security:
 *   - Binds to 127.0.0.1 only (not 0.0.0.0).
 *   - Every request must include the header  X-Api-Tester-Secret
 *     matching the value of BACKEND_SECRET env var (default: "dev-secret").
 *     The frontend reads this from VITE_BACKEND_SECRET.
 */

require('dotenv').config()
const express = require('express')
const cors = require('cors')
const axios = require('axios')
const { URL } = require('url')

const app = express()

// Allow the Vite dev-server origin only; in production callers come from
// the same origin, so this list can be tightened further.
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173'] }))
app.use(express.json({ limit: '10mb' }))

const PORT = process.env.PORT || 4001
const BACKEND_SECRET = process.env.BACKEND_SECRET || 'dev-secret'

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Every request (except /health) must carry the shared secret so that
// other browser tabs / local applications cannot reach the DB or proxy
// endpoints without knowing the secret.
app.use((req, res, next) => {
  if (req.path === '/health') return next()
  const provided = req.headers['x-api-tester-secret']
  if (provided !== BACKEND_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

// ─── SSRF helpers ─────────────────────────────────────────────────────────────
// Reject proxy targets that point at loopback / private / link-local addresses
// so an attacker who controls the URL field cannot reach internal services.
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd)/i

function isPrivateOrLoopback(hostname) {
  // Catch numeric and named loopback
  if (hostname === 'localhost') return true
  if (PRIVATE_IP_RE.test(hostname)) return true
  return false
}

function assertSafeProxyUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid proxy URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Proxy does not support protocol: ${parsed.protocol}`)
  }
  if (isPrivateOrLoopback(parsed.hostname)) {
    throw new Error(`Proxy target "${parsed.hostname}" is a private/loopback address and is not allowed`)
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: Date.now() }))

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * A simple per-connection-config cache so we reuse existing driver instances
 * rather than opening a fresh TCP connection on every request.
 *
 * Key  = stable JSON of the connection config fields that uniquely identify it.
 * Value = the driver object ({ query, end }).
 *
 * When a cached driver throws we evict it so the next call rebuilds it.
 */
const driverCache = new Map()

function connCacheKey(conn) {
  const { dbType, host, port, database, username, schema } = conn
  return JSON.stringify({ dbType, host, port, database, username, schema })
}

/**
 * Return a cached driver for this connection config, or build and cache a new one.
 */
async function getDriver(conn) {
  const key = connCacheKey(conn)
  if (driverCache.has(key)) return driverCache.get(key)
  const driver = await buildDriver(conn)
  driverCache.set(key, driver)
  return driver
}

/**
 * Build a fresh driver connection based on dbType.
 * Returns { query, end } — a thin uniform interface.
 */
async function buildDriver(conn) {
  const { dbType, host, port, database, username, password, schema } = conn

  if (dbType === 'postgresql') {
    const { Client } = require('pg')
    const client = new Client({
      host,
      port: Number(port),
      database,
      user: username,
      password,
      connectionTimeoutMillis: 8000,
    })
    await client.connect()
    if (schema) await client.query(`SET search_path TO "${schema}"`)
    return {
      query: async (sql, params) => {
        const r = await client.query(sql, params)
        const columns = r.fields ? r.fields.map((f) => f.name) : []
        const rows = r.rows ?? []
        return { columns, rows, rowCount: r.rowCount ?? rows.length }
      },
      end: () => client.end(),
    }
  }

  if (dbType === 'mysql') {
    const mysql = require('mysql2/promise')
    const connection = await mysql.createConnection({
      host,
      port: Number(port),
      database,
      user: username,
      password,
      connectTimeout: 8000,
    })
    return {
      query: async (sql, params) => {
        const [rows, fields] = await connection.execute(sql, params ?? [])
        const columns = fields ? fields.map((f) => f.name) : Object.keys(rows[0] ?? {})
        return { columns, rows: rows, rowCount: rows.length }
      },
      end: () => connection.end(),
    }
  }

  if (dbType === 'mssql') {
    const mssql = require('mssql')
    const pool = await mssql.connect({
      server: host,
      port: Number(port),
      database,
      user: username,
      password,
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 8000,
    })
    return {
      query: async (sql) => {
        const result = await pool.request().query(sql)
        const rows = result.recordset ?? []
        const columns = rows.length > 0 ? Object.keys(rows[0]) : result.recordsets?.[0]?.columns?.map((c) => c.name) ?? []
        return { columns, rows, rowCount: result.rowsAffected?.[0] ?? rows.length }
      },
      end: () => pool.close(),
    }
  }

  if (dbType === 'oracle') {
    const oracledb = require('oracledb')
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT
    const connection = await oracledb.getConnection({
      user: username,
      password,
      connectString: `${host}:${port}/${database}`,
    })
    if (schema) await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${schema}`)
    return {
      query: async (sql) => {
        const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT })
        const rows = result.rows ?? []
        const columns = result.metaData ? result.metaData.map((m) => m.name) : Object.keys(rows[0] ?? {})
        return { columns, rows, rowCount: rows.length }
      },
      end: () => connection.close(),
    }
  }

  if (dbType === 'sqlite') {
    const Database = require('better-sqlite3')
    const db = new Database(database) // database = file path for sqlite
    return {
      query: async (sql) => {
        const stmt = db.prepare(sql)
        let rows
        try {
          rows = stmt.all()
        } catch {
          rows = []
          stmt.run()
        }
        const columns = rows.length > 0 ? Object.keys(rows[0]) : []
        return { columns, rows, rowCount: rows.length }
      },
      end: () => db.close(),
    }
  }

  throw new Error(`Unsupported database type: ${dbType}`)
}

// ─── POST /db/test ─────────────────────────────────────────────────────────────

app.post('/db/test', async (req, res) => {
  let driver = null
  try {
    driver = await buildDriver(req.body)
    // Run a minimal probe query
    await driver.query('SELECT 1' + (req.body.dbType === 'oracle' ? ' FROM DUAL' : ''))
    res.json({ success: true, message: '✓ Connection successful' })
  } catch (e) {
    res.json({ success: false, message: e.message })
  } finally {
    if (driver) try { await driver.end() } catch { /* ignore */ }
  }
})

// ─── POST /db/query ────────────────────────────────────────────────────────────

app.post('/db/query', async (req, res) => {
  const { connection, sql, params } = req.body
  if (!connection || !sql) return res.status(400).json({ error: 'connection and sql are required' })

  const start = Date.now()
  const key = connCacheKey(connection)
  try {
    // Use cached driver; on error evict and retry once with a fresh connection.
    let driver
    try {
      driver = await getDriver(connection)
      const { columns, rows, rowCount } = await driver.query(sql, params)
      const executionTime = Date.now() - start
      return res.json({ columns, rows, rowCount, executionTime })
    } catch (queryErr) {
      // Evict potentially stale connection and try once more.
      driverCache.delete(key)
      driver = await getDriver(connection)
      const { columns, rows, rowCount } = await driver.query(sql, params)
      const executionTime = Date.now() - start
      return res.json({ columns, rows, rowCount, executionTime })
    }
  } catch (e) {
    driverCache.delete(key)
    res.json({
      columns: [],
      rows: [],
      rowCount: 0,
      executionTime: Date.now() - start,
      error: e.message,
    })
  }
})

// ─── POST /db/query-values ─────────────────────────────────────────────────────
// Lightweight helper used by the Test Data Generator.
// Executes a SQL query and returns all values from a single named column as an
// array so the frontend can pick from them when populating DB-sourced fields.
//
// Body: { connection: DbConnection, sql: string, column: string }
// Response: { values: unknown[], error?: string }

app.post('/db/query-values', async (req, res) => {
  const { connection, sql, column } = req.body
  if (!connection || !sql || !column) {
    return res.status(400).json({ error: 'connection, sql and column are required' })
  }

  const key = connCacheKey(connection)
  try {
    const driver = await getDriver(connection)
    const { rows } = await driver.query(sql)
    const values = rows.map((r) => {
      // column lookup: exact → case-insensitive → first column
      if (column in r) return r[column]
      const lc = column.toLowerCase()
      const key = Object.keys(r).find((k) => k.toLowerCase() === lc)
      return key ? r[key] : Object.values(r)[0]
    }).filter((v) => v !== null && v !== undefined)
    res.json({ values })
  } catch (e) {
    driverCache.delete(key)
    res.json({ values: [], error: e.message })
  }
})

// ─── POST /proxy ──────────────────────────────────────────────────────────────
// Forwards an HTTP request on behalf of the browser (bypasses browser CORS).
// Body: { method, url, headers, body }
// Response: { status, statusText, headers, body, responseTime }

app.post('/proxy', async (req, res) => {
  const { method, url, headers: reqHeaders, body: reqBody } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })

  // Block SSRF — reject private/loopback targets before making any network call.
  try {
    assertSafeProxyUrl(url)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  const start = Date.now()
  try {
    const axiosResp = await axios({
      method: (method || 'GET').toLowerCase(),
      url,
      headers: reqHeaders ?? {},
      data: reqBody ?? undefined,
      // Don't throw on non-2xx so we can forward the real status
      validateStatus: () => true,
      // Forward as a string so we don't lose non-JSON bodies
      responseType: 'text',
      timeout: 30000,
    })

    const responseTime = Date.now() - start
    // axios stores response headers as a plain object
    const respHeaders = {}
    Object.entries(axiosResp.headers).forEach(([k, v]) => { respHeaders[k] = String(v) })

    res.json({
      status: axiosResp.status,
      statusText: axiosResp.statusText,
      headers: respHeaders,
      body: axiosResp.data,
      responseTime,
    })
  } catch (e) {
    res.json({
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      responseTime: Date.now() - start,
      error: e.message,
    })
  }
})

// ─── Start ────────────────────────────────────────────────────────────────────
// Bind to 127.0.0.1 only — never expose to the network interface.

app.listen(PORT, '127.0.0.1', () => {
  console.log(`API Tester backend running on http://127.0.0.1:${PORT}`)
  console.log(`Shared secret header : X-Api-Tester-Secret`)
  console.log(`Secret value         : ${BACKEND_SECRET === 'dev-secret' ? 'dev-secret (set BACKEND_SECRET env to override)' : '(from env)'}`)
  console.log('Endpoints:')
  console.log('  GET  /health')
  console.log('  POST /proxy')
  console.log('  POST /db/test')
  console.log('  POST /db/query')
  console.log('  POST /db/query-values')
})
