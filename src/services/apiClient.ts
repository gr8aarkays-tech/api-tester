import type {
  ApiRequest,
  ResponseData,
  TestResult,
  KeyValueItem,
  TestAssertion,
} from '../types'
import { environmentService } from './environmentService'
import { storageService } from './storageService'
import type { Environment } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env ?? {}
const DB_BACKEND: string = (_env.VITE_DB_BACKEND as string | undefined) ?? 'http://localhost:4001'
const BACKEND_SECRET: string = (_env.VITE_BACKEND_SECRET as string | undefined) ?? 'dev-secret'

function getStatusText(status: number): string {
  const map: Record<number, string> = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict',
    422: 'Unprocessable Entity', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
  }
  return map[status] ?? 'Unknown'
}

function buildUrl(request: ApiRequest, env: Environment | null): string {
  const resolve = (s: string) => environmentService.resolve(s, env)
  let url = resolve(request.url.trim())
  if (!url) return ''

  const enabledParams = request.params.filter((p) => p.enabled && p.key)
  if (enabledParams.length === 0) return url

  const qs = enabledParams
    .map((p) => `${encodeURIComponent(resolve(p.key))}=${encodeURIComponent(resolve(p.value))}`)
    .join('&')

  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`
}

function buildHeaders(request: ApiRequest, env: Environment | null): Record<string, string> {
  const resolve = (s: string) => environmentService.resolve(s, env)
  const headers: Record<string, string> = {}

  for (const h of request.headers) {
    if (h.enabled && h.key) {
      // Resolve environment variables in both the key and the value
      headers[resolve(h.key)] = resolve(h.value)
    }
  }

  // Auth
  const auth = request.auth
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${resolve(auth.token)}`
  } else if (auth.type === 'basic' && auth.username) {
    const encoded = btoa(`${resolve(auth.username)}:${resolve(auth.password ?? '')}`)
    headers['Authorization'] = `Basic ${encoded}`
  } else if (auth.type === 'apikey' && auth.apiKeyName && auth.apiKeyIn === 'header') {
    headers[resolve(auth.apiKeyName)] = resolve(auth.apiKeyValue ?? '')
  }

  return headers
}

function buildBody(request: ApiRequest, env: Environment | null): BodyInit | null {
  const resolve = (s: string) => environmentService.resolve(s, env)
  switch (request.bodyType) {
    case 'none': return null
    case 'json': return request.bodyJson
    case 'xml': return request.bodyXml
    case 'raw': return request.bodyRaw
    case 'form-data': {
      const fd = new FormData()
      for (const item of request.bodyFormData) {
        if (item.enabled) fd.append(resolve(item.key), resolve(item.value))
      }
      return fd
    }
    case 'urlencoded': {
      const params = new URLSearchParams()
      for (const item of request.bodyUrlEncoded) {
        if (item.enabled) params.append(resolve(item.key), resolve(item.value))
      }
      return params.toString()
    }
    default: return null
  }
}

function runTests(request: ApiRequest, resp: ResponseData): TestResult[] {
  const results: TestResult[] = []
  for (const t of request.tests) {
    if (!t.enabled) continue
    let passed = false
    let message = ''
    try {
      switch (t.type) {
        case 'status':
          passed = resp.status === t.statusCode
          message = `Status ${resp.status} ${passed ? '==' : '!='} ${t.statusCode}`
          break
        case 'responseTime':
          passed = resp.responseTime <= (t.maxMs ?? 1000)
          message = `${resp.responseTime}ms ${passed ? '<=' : '>'} ${t.maxMs}ms`
          break
        case 'contains':
          passed = resp.body.includes(t.searchText ?? '')
          message = `Body ${passed ? 'contains' : 'does not contain'} "${t.searchText}"`
          break
        case 'headerExists':
          passed = t.headerName ? t.headerName.toLowerCase() in resp.headers : false
          message = `Header "${t.headerName}" ${passed ? 'exists' : 'not found'}`
          break
        case 'headerEquals':
          passed = resp.headers[(t.headerName ?? '').toLowerCase()] === t.headerValue
          message = `Header "${t.headerName}" ${passed ? '==' : '!='} "${t.headerValue}"`
          break
        case 'jsonField': {
          let obj: unknown
          try { obj = JSON.parse(resp.body) } catch { obj = null }
          const parts = (t.jsonPath ?? '').split('.')
          let val: unknown = obj
          for (const p of parts) {
            if (val && typeof val === 'object') val = (val as Record<string, unknown>)[p]
            else { val = undefined; break }
          }
          if (t.operator === 'exists') passed = val !== undefined && val !== null
          else if (t.operator === 'notEmpty') passed = val !== undefined && val !== null && val !== ''
          else if (t.operator === 'equals') passed = String(val) === t.expectedValue
          else if (t.operator === 'contains') passed = String(val).includes(t.expectedValue ?? '')
          message = `${t.jsonPath} ${t.operator} ${t.expectedValue ?? ''}`
          break
        }
      }
    } catch {
      passed = false
      message = 'Error evaluating test'
    }
    results.push({ name: buildTestName(t), passed, message })
  }
  return results
}

function buildTestName(t: TestAssertion): string {
  switch (t.type) {
    case 'status': return `Status code equals ${t.statusCode}`
    case 'responseTime': return `Response time < ${t.maxMs}ms`
    case 'contains': return `Body contains "${t.searchText}"`
    case 'headerExists': return `Header "${t.headerName}" exists`
    case 'headerEquals': return `Header "${t.headerName}" equals "${t.headerValue}"`
    case 'jsonField': return `${t.jsonPath} ${t.operator} "${t.expectedValue ?? ''}"`
    default: return 'Test'
  }
}

export async function executeRequest(
  request: ApiRequest,
  env: Environment | null,
  signal?: AbortSignal,
): Promise<ResponseData> {
  const url = buildUrl(request, env)
  if (!url) {
    return { status: 0, statusText: 'Invalid URL', headers: {}, body: '', responseTime: 0, size: 0, testResults: [], error: 'Invalid URL' }
  }

  const headers = buildHeaders(request, env)
  const body = ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? null : buildBody(request, env)

  // Set content-type for body if not set
  if (body && !headers['Content-Type'] && !headers['content-type']) {
    if (request.bodyType === 'json') headers['Content-Type'] = 'application/json'
    else if (request.bodyType === 'xml') headers['Content-Type'] = 'application/xml'
    else if (request.bodyType === 'urlencoded') headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const settings = storageService.getSettings()
  const timeoutMs = settings.requestTimeout > 0 ? settings.requestTimeout : 30_000

  // Wrap the caller's signal with a timeout so requests don't hang indefinitely.
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)
  // Combine the timeout signal with any externally-provided abort signal.
  const combinedSignal = signal
    ? (() => {
        const c = new AbortController()
        signal.addEventListener('abort', () => c.abort())
        timeoutController.signal.addEventListener('abort', () => c.abort())
        return c.signal
      })()
    : timeoutController.signal

  const startTime = performance.now()

  // ── Proxy path ──────────────────────────────────────────────────────────────
  if (settings.useProxy) {
    const proxyBase = settings.proxyUrl || DB_BACKEND
    try {
      const bodyStr = body instanceof FormData
        ? undefined   // FormData can't be easily proxied as JSON; fall through to direct
        : body instanceof URLSearchParams
          ? body.toString()
          : typeof body === 'string' ? body : undefined

      if (body instanceof FormData) {
        // Fall through to direct fetch for multipart
      } else {
        const proxyResp = await fetch(`${proxyBase}/proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Tester-Secret': BACKEND_SECRET },
          body: JSON.stringify({ method: request.method, url, headers, body: bodyStr }),
          signal: combinedSignal,
        })
        const data = await proxyResp.json() as {
          status: number; statusText: string; headers: Record<string, string>; body: string; responseTime: number; error?: string
        }
        if (data.error) {
          clearTimeout(timeoutId)
          return { status: 0, statusText: 'Proxy Error', headers: {}, body: '', responseTime: Math.round(performance.now() - startTime), size: 0, testResults: [], error: data.error }
        }
        const partialViaProxy: ResponseData = {
          status: data.status,
          statusText: data.statusText || getStatusText(data.status),
          headers: data.headers ?? {},
          body: data.body ?? '',
          responseTime: data.responseTime ?? Math.round(performance.now() - startTime),
          size: new Blob([data.body ?? '']).size,
          testResults: [],
        }
        partialViaProxy.testResults = runTests(request, partialViaProxy)
        clearTimeout(timeoutId)
        return partialViaProxy
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const responseTime = Math.round(performance.now() - startTime)
      const message = err instanceof Error ? err.message : String(err)
      return { status: 0, statusText: 'Proxy Error', headers: {}, body: '', responseTime, size: 0, testResults: [], error: `Proxy unreachable: ${message}` }
    }
  }

  // ── Direct fetch path ───────────────────────────────────────────────────────
  try {
    const fetchResp = await fetch(url, {
      method: request.method,
      headers,
      body: body as BodyInit,
      signal: combinedSignal,
      redirect: 'follow',
    })

    const responseTime = Math.round(performance.now() - startTime)
    const respText = await fetchResp.text()
    const size = new Blob([respText]).size

    const respHeaders: Record<string, string> = {}
    fetchResp.headers.forEach((value, key) => { respHeaders[key] = value })

    const partialResp: ResponseData = {
      status: fetchResp.status,
      statusText: fetchResp.statusText || getStatusText(fetchResp.status),
      headers: respHeaders,
      body: respText,
      responseTime,
      size,
      testResults: [],
    }

    partialResp.testResults = runTests(request, partialResp)
    return partialResp
  } catch (err: unknown) {
    const responseTime = Math.round(performance.now() - startTime)
    const message = err instanceof Error ? err.message : String(err)
    let error = message
    let advice = ''

    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      error = 'Network Error'
      advice = 'Possible causes:\n• CORS policy blocked this request\n• Network is unreachable\n• Invalid URL\n\nSolutions:\n• Configure the API to allow this origin\n• Enable "Use Proxy" in Settings (requires backend server)\n• Check the URL is correct'
    } else if (message.includes('abort')) {
      error = 'Request Aborted'
      advice = 'The request was cancelled.'
    } else if (message.includes('timeout')) {
      error = 'Request Timeout'
      advice = 'The server did not respond in time.'
    }

    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      responseTime,
      size: 0,
      testResults: [],
      error: advice ? `${error}\n\n${advice}` : error,
    }
  } finally {
    // Always clear the timeout timer — whether we returned, threw, or aborted.
    clearTimeout(timeoutId)
  }
}
