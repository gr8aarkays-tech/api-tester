import React from 'react'
import type { KeyValueItem } from '../types'
import { newKV } from '../types'

interface Props {
  items: KeyValueItem[]
  onChange: (items: KeyValueItem[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  addLabel?: string
}

export default function KeyValueEditor({ items, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value', addLabel = 'Add' }: Props) {
  const update = (id: string, field: keyof KeyValueItem, value: string | boolean) => {
    onChange(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)))
  }
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id))
  const add = () => onChange([...items, newKV()])

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => update(item.id, 'enabled', e.target.checked)}
            className="w-4 h-4 accent-accent flex-shrink-0"
          />
          <input
            className="flex-1 px-2 py-1 text-xs"
            placeholder={keyPlaceholder}
            value={item.key}
            onChange={(e) => update(item.id, 'key', e.target.value)}
          />
          <input
            className="flex-1 px-2 py-1 text-xs"
            placeholder={valuePlaceholder}
            value={item.value}
            onChange={(e) => update(item.id, 'value', e.target.value)}
          />
          <input
            className="w-28 px-2 py-1 text-xs"
            placeholder="Description"
            value={item.description ?? ''}
            onChange={(e) => update(item.id, 'description', e.target.value)}
          />
          <button onClick={() => remove(item.id)} className="text-muted hover:text-danger px-1 text-sm">✕</button>
        </div>
      ))}
      <button onClick={add} className="btn btn-ghost text-xs self-start mt-1">+ {addLabel}</button>
    </div>
  )
}
