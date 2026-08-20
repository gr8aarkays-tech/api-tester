import type { ApiRequest } from '../types'

type Language = 'curl' | 'fetch' | 'axios' | 'typescript' | 'python' | 'java' | 'csharp' | 'powershell'

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript Fetch' },
  { id: 'axios', label: 'JavaScript Axios' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python (requests)' },
  { id: 'java', label: 'Java (OkHttp)' },
  { id: 'csharp', label: 'C# (HttpClient)' },
  { id: 'powershell', label: 'PowerShell' },
]

function buildUrl(request: ApiRequest): string {
  let url = request.url
  const enabled = request.params.filter((p) => p.enabled && p.key)
  if (enabled.length > 0) {
    const qs = enabled.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
    url += (url.includes('?') ? '&' : '?') + qs
  }
  return url
}

function headersObj(request: ApiRequest): Record<string, string> {
  const h: Record<string, string> = {}
  for (const item of request.headers) {
    if (item.enabled && item.key) h[item.key] = item.value
  }
  const auth = request.auth
  if (auth.type === 'bearer') h['Authorization'] = `Bearer ${auth.token ?? ''}`
  else if (auth.type === 'basic') h['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`
  else if (auth.type === 'apikey' && auth.apiKeyIn === 'header') h[auth.apiKeyName ?? ''] = auth.apiKeyValue ?? ''
  return h
}

export function generateCode(request: ApiRequest, lang: Language): string {
  const url = buildUrl(request)
  const headers = headersObj(request)
  const hasBody = request.bodyType !== 'none'
  const body = request.bodyType === 'json' ? request.bodyJson
    : request.bodyType === 'xml' ? request.bodyXml
    : request.bodyType === 'raw' ? request.bodyRaw : ''

  const headersStr = JSON.stringify(headers, null, 2)

  switch (lang) {
    case 'curl': {
      const lines = [`curl --request ${request.method} \\`, `  --url '${url}'`]
      for (const [k, v] of Object.entries(headers)) {
        lines[lines.length - 1] += ' \\'
        lines.push(`  --header '${k}: ${v}'`)
      }
      if (hasBody && body) {
        lines[lines.length - 1] += ' \\'
        lines.push(`  --data '${body.replace(/'/g, "\\'")}'`)
      }
      return lines.join('\n')
    }

    case 'fetch':
    case 'typescript': {
      const bodyLine = hasBody && body ? `,\n    body: \`${body.replace(/`/g, '\\`')}\`` : ''
      const type = lang === 'typescript' ? ': Response' : ''
      return `const response${type} = await fetch(
  '${url}',
  {
    method: '${request.method}',
    headers: ${headersStr}${bodyLine}
  }
);
const data = await response.json();
console.log(data);`
    }

    case 'axios': {
      const bodyLine = hasBody && body ? `,\n  data: ${body}` : ''
      return `import axios from 'axios';

const response = await axios({
  method: '${request.method.toLowerCase()}',
  url: '${url}',
  headers: ${headersStr}${bodyLine}
});
console.log(response.data);`
    }

    case 'python': {
      const headersDict = JSON.stringify(headers, null, 4).replace(/"/g, "'")
      const bodyLine = hasBody && body ? `\ndata = '''${body}'''\nresponse = requests.${request.method.toLowerCase()}(url, headers=headers, data=data)` : `\nresponse = requests.${request.method.toLowerCase()}(url, headers=headers)`
      return `import requests

url = '${url}'
headers = ${headersDict}
${bodyLine}

print(response.status_code)
print(response.json())`
    }

    case 'java': {
      const headerLines = Object.entries(headers).map(([k, v]) => `        .addHeader("${k}", "${v}")`).join('\n')
      const bodyLine = hasBody && body ? `\n        .method("${request.method}", RequestBody.create(MediaType.parse("application/json"), "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"))` : `\n        .method("${request.method}", null)`
      return `import okhttp3.*;

OkHttpClient client = new OkHttpClient();

Request request = new Request.Builder()
        .url("${url}")
${headerLines}${bodyLine}
        .build();

Response response = client.newCall(request).execute();
System.out.println(response.body().string());`
    }

    case 'csharp': {
      const headerLines = Object.entries(headers)
        .filter(([k]) => k.toLowerCase() !== 'content-type')
        .map(([k, v]) => `    client.DefaultRequestHeaders.Add("${k}", "${v}");`)
        .join('\n')
      const contentType = headers['Content-Type'] || headers['content-type'] || 'application/json'

      // Build a correctly-typed HttpMethod expression.
      // HttpMethod has static properties for the common verbs; for anything else
      // (e.g. PATCH on pre-.NET 5, or custom verbs) we use `new HttpMethod(...)`.
      const knownVerbs = new Set(['Get', 'Post', 'Put', 'Delete', 'Head', 'Options', 'Trace'])
      const verbPascal = `${request.method[0]}${request.method.slice(1).toLowerCase()}`
      const httpMethodExpr = knownVerbs.has(verbPascal)
        ? `HttpMethod.${verbPascal}`
        : `new HttpMethod("${request.method}")`

      // Use typed helper methods (GetAsync/PostAsync/PutAsync) only when there is
      // no body; otherwise fall through to HttpRequestMessage for correctness.
      let bodyLine: string
      if (hasBody && body) {
        const contentVar = `var content = new StringContent(@"${body.replace(/"/g, '""')}", System.Text.Encoding.UTF8, "${contentType}");`
        if (request.method === 'POST') {
          bodyLine = `\n${contentVar}\nvar response = await client.PostAsync("${url}", content);`
        } else if (request.method === 'PUT') {
          bodyLine = `\n${contentVar}\nvar response = await client.PutAsync("${url}", content);`
        } else {
          // PATCH, DELETE with body, custom verbs — all need HttpRequestMessage
          bodyLine = `\n${contentVar}\nvar request = new HttpRequestMessage(${httpMethodExpr}, "${url}") { Content = content };\nvar response = await client.SendAsync(request);`
        }
      } else {
        if (request.method === 'GET') {
          bodyLine = `\nvar response = await client.GetAsync("${url}");`
        } else {
          bodyLine = `\nvar request = new HttpRequestMessage(${httpMethodExpr}, "${url}");\nvar response = await client.SendAsync(request);`
        }
      }

      return `using System.Net.Http;

var client = new HttpClient();
${headerLines}${bodyLine}
var body = await response.Content.ReadAsStringAsync();
Console.WriteLine(body);`
    }

    case 'powershell': {
      const headerHash = Object.entries(headers).map(([k, v]) => `  "${k}" = "${v}"`).join('\n')
      const bodyLine = hasBody && body ? `\n$Body = @'\n${body}\n'@\n$Response = Invoke-RestMethod -Uri '${url}' -Method ${request.method} -Headers $Headers -Body $Body` : `\n$Response = Invoke-RestMethod -Uri '${url}' -Method ${request.method} -Headers $Headers`
      return `$Headers = @{
${headerHash}
}
${bodyLine}

$Response | ConvertTo-Json`
    }

    default:
      return '// Not implemented'
  }
}
