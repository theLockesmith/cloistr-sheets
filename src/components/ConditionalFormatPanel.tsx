/**
 * ConditionalFormatPanel — apply and clear highlight rules on a cell range.
 *
 * Rules are applied via `applyConditionalFormat()` in conditional-format.ts,
 * which fires set-range-values so the bridge syncs highlights to all
 * collaborators. "Clear" removes background styles from the range.
 *
 * Mobile notes:
 * - All interactive controls are min-height 44px.
 * - Panel wraps on narrow viewports.
 */
import { useState } from 'react'
import {
  applyConditionalFormat,
  clearConditionalFormat,
  type ConditionalRule,
  type ConditionOp,
} from '../lib/conditional-format.js'
import { parseRangeString } from '../lib/sort-filter.js'
import type { SortFilterServices } from '../lib/sort-filter.js'

interface ConditionalFormatPanelProps {
  services: SortFilterServices
  unitId: string
  sheetId: string
}

const LABEL: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--cloistr-text-muted)',
  fontWeight: 500,
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '0.25rem 0.375rem',
  fontSize: '0.8125rem',
  border: '1px solid var(--cloistr-border)',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--cloistr-bg)',
  color: 'var(--cloistr-text)',
  minWidth: '5rem',
  minHeight: 36,
}

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  cursor: 'pointer',
  minWidth: '7rem',
}

const BTN: React.CSSProperties = {
  padding: '0 0.75rem',
  minHeight: 44,
  fontSize: '0.8125rem',
  border: '1px solid var(--cloistr-border)',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--cloistr-bg-hover)',
  color: 'var(--cloistr-text)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const OP_LABELS: Record<ConditionOp, string> = {
  gt: 'greater than',
  gte: 'greater than or equal',
  lt: 'less than',
  lte: 'less than or equal',
  eq: 'equal to',
  neq: 'not equal to',
  contains: 'contains text',
  not_empty: 'is not empty',
}

const PRESET_COLORS = [
  { label: 'Red', value: '#fca5a5' },
  { label: 'Orange', value: '#fdba74' },
  { label: 'Yellow', value: '#fde047' },
  { label: 'Green', value: '#86efac' },
  { label: 'Blue', value: '#93c5fd' },
  { label: 'Purple', value: '#c4b5fd' },
]

export function ConditionalFormatPanel({
  services,
  unitId,
  sheetId,
}: ConditionalFormatPanelProps) {
  const [rangeStr, setRangeStr] = useState('A1:Z100')
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [op, setOp] = useState<ConditionOp>('gt')
  const [value, setValue] = useState('')
  const [color, setColor] = useState('#fde047')
  const [status, setStatus] = useState<string | null>(null)

  const noValueNeeded = op === 'not_empty'

  function handleApply() {
    const parsed = parseRangeString(rangeStr, unitId, sheetId)
    if (!parsed) {
      setRangeError('Invalid range — use A1:D100 format')
      return
    }
    setRangeError(null)

    const rule: ConditionalRule = { op, value, color }
    applyConditionalFormat(
      services,
      rule,
      unitId,
      sheetId,
      parsed.startRow,
      parsed.endRow,
      parsed.startCol,
      parsed.endCol,
    )
    setStatus('Rule applied')
    setTimeout(() => setStatus(null), 2500)
  }

  function handleClear() {
    const parsed = parseRangeString(rangeStr, unitId, sheetId)
    if (!parsed) {
      setRangeError('Invalid range')
      return
    }
    setRangeError(null)
    clearConditionalFormat(
      services,
      unitId,
      sheetId,
      parsed.startRow,
      parsed.endRow,
      parsed.startCol,
      parsed.endCol,
    )
    setStatus('Highlights cleared')
    setTimeout(() => setStatus(null), 2500)
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '0.5rem',
      padding: '0.375rem 0.75rem',
      backgroundColor: 'var(--cloistr-bg)',
      borderBottom: '1px solid var(--cloistr-border)',
      fontSize: '0.8125rem',
    }}>
      <span style={LABEL}>Conditional format</span>

      {/* Range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <label htmlFor="cf-range" style={LABEL}>Range</label>
        <input
          id="cf-range"
          type="text"
          value={rangeStr}
          onChange={(e) => { setRangeStr(e.target.value); setRangeError(null) }}
          style={{ ...INPUT_STYLE, borderColor: rangeError ? 'var(--cloistr-error)' : 'var(--cloistr-border)' }}
          placeholder="A1:Z100"
          aria-describedby={rangeError ? 'cf-range-error' : undefined}
        />
        {rangeError && (
          <span id="cf-range-error" style={{ fontSize: '0.75rem', color: 'var(--cloistr-error)' }}>{rangeError}</span>
        )}
      </div>

      {/* Operator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <label htmlFor="cf-op" style={LABEL}>when cell</label>
        <select
          id="cf-op"
          value={op}
          onChange={(e) => setOp(e.target.value as ConditionOp)}
          style={SELECT_STYLE}
          aria-label="Condition operator"
        >
          {(Object.keys(OP_LABELS) as ConditionOp[]).map((o) => (
            <option key={o} value={o}>{OP_LABELS[o]}</option>
          ))}
        </select>
      </div>

      {/* Comparison value (hidden for not_empty) */}
      {!noValueNeeded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <label htmlFor="cf-value" style={LABEL}>value</label>
          <input
            id="cf-value"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={INPUT_STYLE}
            placeholder="e.g. 100"
          />
        </div>
      )}

      {/* Highlight color */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={LABEL}>highlight</span>
        {PRESET_COLORS.map((c) => (
          <button
            key={c.value}
            title={c.label}
            aria-pressed={color === c.value}
            aria-label={`Highlight color: ${c.label}`}
            onClick={() => setColor(c.value)}
            style={{
              width: 24,
              height: 24,
              minHeight: 24,
              padding: 0,
              borderRadius: '50%',
              border: color === c.value ? '2px solid var(--cloistr-text)' : '2px solid transparent',
              backgroundColor: c.value,
              cursor: 'pointer',
            }}
          />
        ))}
        {/* Custom color picker */}
        <label title="Custom color" style={{ cursor: 'pointer' }}>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 24, height: 24, padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer' }}
            aria-label="Custom highlight color"
          />
        </label>
      </div>

      <button onClick={handleApply} style={{ ...BTN, backgroundColor: 'var(--cloistr-info)', color: '#fff', borderColor: 'var(--cloistr-info)' }}>
        Apply
      </button>
      <button onClick={handleClear} style={BTN}>
        Clear
      </button>

      {status && (
        <span style={{ fontSize: '0.75rem', color: 'var(--cloistr-success)' }}>{status}</span>
      )}
    </div>
  )
}
