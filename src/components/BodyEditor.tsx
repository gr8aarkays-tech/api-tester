import React, { useState, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { oneDark } from '@codemirror/theme-one-dark'
import type { BodyType, KeyValueItem } from '../types'
import { formatJson, minifyJson } from '../utils/jsonFormatter'
import { formatXml } from '../utils/jsonFormatter'
import { generateJsonBody, generateXmlBody } from '../utils/bodyValueGenerator'
import KeyValueEditor from './KeyValueEditor'

interface Props {
  bodyType: BodyType
  bodyJson: string
  bodyXml: string
  bodyFormData: KeyValueItem[]
  bodyUrlEncoded: KeyValueItem[]
  bodyRaw: string
  onBodyTypeChange: (t: BodyType) => void
  onBodyJsonChange: (v: string) => void
  onBodyXmlChange: (v: string) => void
  onBodyFormDataChange: (items: KeyValueItem[]) => void
  onBodyUrlEncodedChange: (items: KeyValueItem[]) => void
  onBodyRawChange: (v: string) => void
}

const BODY_TYPES: { id: BodyType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'xml', label: 'XML' },
  { id: 'form-data', label: 'Form Data' },
  { id: 'urlencoded', label: 'URL Encoded' },
  { id: 'raw', label: 'Raw' },
  { id: 'binary', label: 'Binary' },
]

export default function BodyEditor(props: Props) {
  const { bodyType, bodyJson, bodyXml, bodyFormData, bodyUrlEncoded, bodyRaw } = props

  const handleFormat = () => {
    if (bodyType === 'json') props.onBodyJsonChange(formatJson(bodyJson))
    if (bodyType === 'xml') props.onBodyXmlChange(formatXml(bodyXml))
  }

  const handleMinify = () => {
    if (bodyType === 'json') props.onBodyJsonChange(minifyJson(bodyJson))
  }

  const handleCopy = () => {
    const text = bodyType === 'json' ? bodyJson : bodyType === 'xml' ? bodyXml : bodyRaw
    navigator.clipboard.writeText(text)
  }

  const handleGenerate = () => {
    if (bodyType === 'json') props.onBodyJsonChange(generateJsonBody(bodyJson))
    if (bodyType === 'xml') props.onBodyXmlChange(generateXmlBody(bodyXml))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Body type selector row */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-border flex-shrink-0">
        {BODY_TYPES.map((t) => (
          <button
            key={t.id}
            className={`px-2 py-0.5 rounded text-xs ${bodyType === t.id ? 'bg-accent text-white' : 'text-muted hover:text-text'}`}
            onClick={() => props.onBodyTypeChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Action buttons row — only shown for json/xml */}
      {(bodyType === 'json' || bodyType === 'xml') && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border flex-shrink-0 bg-surface/50">
          <button
            className="btn btn-ghost text-xs font-semibold text-accent border border-accent/40 hover:bg-accent/10 px-3"
            onClick={handleGenerate}
            title="Regenerate all values in the body (keeps structure and field names)"
          >
            ⚡ Generate
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button className="btn btn-ghost text-xs" onClick={handleFormat}>Format</button>
          {bodyType === 'json' && <button className="btn btn-ghost text-xs" onClick={handleMinify}>Minify</button>}
          <button className="btn btn-ghost text-xs" onClick={handleCopy}>Copy</button>
          <button className="btn btn-ghost text-xs" onClick={() => bodyType === 'json' ? props.onBodyJsonChange('') : props.onBodyXmlChange('')}>Clear</button>
        </div>
      )}

      {/* Body editor */}
      <div className="flex-1 overflow-hidden">
        {bodyType === 'none' && (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            This request has no body.
          </div>
        )}

        {bodyType === 'json' && (
          <CodeMirror
            value={bodyJson}
            height="100%"
            theme={oneDark}
            extensions={[json()]}
            onChange={props.onBodyJsonChange}
            className="h-full text-xs"
          />
        )}

        {bodyType === 'xml' && (
          <CodeMirror
            value={bodyXml}
            height="100%"
            theme={oneDark}
            extensions={[xml()]}
            onChange={props.onBodyXmlChange}
            className="h-full text-xs"
          />
        )}

        {bodyType === 'form-data' && (
          <div className="p-3">
            <KeyValueEditor
              items={bodyFormData}
              onChange={props.onBodyFormDataChange}
              keyPlaceholder="Field name"
              valuePlaceholder="Value"
              addLabel="Add Field"
            />
          </div>
        )}

        {bodyType === 'urlencoded' && (
          <div className="p-3">
            <KeyValueEditor
              items={bodyUrlEncoded}
              onChange={props.onBodyUrlEncodedChange}
              keyPlaceholder="Key"
              valuePlaceholder="Value"
              addLabel="Add Param"
            />
          </div>
        )}

        {bodyType === 'raw' && (
          <textarea
            className="w-full h-full p-3 text-xs font-mono resize-none border-none"
            value={bodyRaw}
            onChange={(e) => props.onBodyRawChange(e.target.value)}
            placeholder="Enter raw body content..."
          />
        )}

        {bodyType === 'binary' && (
          <div className="p-3 flex flex-col gap-2">
            <label className="block text-muted text-xs">Upload File</label>
            <input
              type="file"
              className="text-xs text-text"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  // Notify parent with base64 data URI so the body can be sent
                  props.onBodyRawChange(reader.result as string)
                }
                reader.readAsDataURL(file)
              }}
            />
            {props.bodyRaw && (
              <p className="text-muted text-xs font-mono truncate">{props.bodyRaw.slice(0, 80)}…</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
