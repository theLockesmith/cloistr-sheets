/**
 * SortFilterPanel — a toolbar panel that lets the user sort or filter a
 * rectangular range of cells.
 *
 * SORT: calls sortRange(), which fires sheet.mutation.set-range-values. The
 * bridge's onCommand handler sees that mutation and syncs the result to Yjs,
 * so collaborators see the sorted data automatically.
 *
 * FILTER: calls filterRange(), which hides non-matching rows via
 * sheet.mutation.set-row-hidden. Row visibility is local-only (each user's
 * viewport is independent). clearFilter() restores all rows.
 *
 * The panel is shown/hidden by the parent (Sheet.tsx) via a toolbar toggle.
 */
import { useState } from 'react'
import {
  sortRange,
  filterRange,
  clearFilter,
  colIndexToLetter,
  parseRangeString,
  type SortFilterServices,
  type RangeSpec,
} from '../lib/sort-filter.js'

interface SortFilterPanelProps {
  /** Resolved Univer services from BridgeHandle.services. */
  services: SortFilterServices
  /** Active sheet id (from the bridge). */
  sheetId: string
  /** Workbook unit id (from the bridge). */
  unitId: string
}

/** Convert a column count into an option list [A, B, C, …]. */
function columnOptions(startCol: number, endCol: number): Array<{ value: number; label: string }> {
  const opts: Array<{ value: number; label: string }> = []
  for (let c = startCol; c <= endCol; c++) {
    opts.push({ value: c, label: colIndexToLetter(c) })
  }
  return opts
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '0.25rem 0.375rem',
  fontSize: '0.8125rem',
  border: '1px solid var(--cloistr-border)',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--cloistr-bg)',
  color: 'var(--cloistr-text)',
  width: '7rem',
}

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  width: '4.5rem',
  cursor: 'pointer',
}

const BTN: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  fontSize: '0.8125rem',
  border: '1px solid var(--cloistr-border)',
  borderRadius: '0.25rem',
  backgroundColor: 'var(--cloistr-bg-hover)',
  color: 'var(--cloistr-text)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  backgroundColor: 'var(--cloistr-info)',
  color: '#fff',
  borderColor: 'var(--cloistr-info)',
}

const LABEL: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--cloistr-text-muted)',
  fontWeight: 500,
}

const DIVIDER: React.CSSProperties = {
  width: 1,
  height: '1.5rem',
  backgroundColor: 'var(--cloistr-border)',
  margin: '0 0.5rem',
  flexShrink: 0,
}

export function SortFilterPanel({ services, sheetId, unitId }: SortFilterPanelProps) {
  const [rangeStr, setRangeStr] = useState('A1:Z100')
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [parsedRange, setParsedRange] = useState<RangeSpec | null>(() =>
    parseRangeString('A1:Z100', unitId, sheetId)
  )

  // Sort state
  const [sortCol, setSortCol] = useState(0) // 0-based column index

  // Filter state
  const [filterCol, setFilterCol] = useState(0)
  const [filterValue, setFilterValue] = useState('')
  const [filterActive, setFilterActive] = useState(false)

  function updateRange(value: string) {
    setRangeStr(value)
    const r = parseRangeString(value, unitId, sheetId)
    if (r) {
      setRangeError(null)
      setParsedRange(r)
      // Clamp column pickers if the new range is narrower.
      if (sortCol < r.startCol || sortCol > r.endCol) setSortCol(r.startCol)
      if (filterCol < r.startCol || filterCol > r.endCol) setFilterCol(r.startCol)
    } else {
      setRangeError('Invalid range — use A1:D100 format')
      setParsedRange(null)
    }
  }

  function handleSort(order: 'asc' | 'desc') {
    if (!parsedRange) return
    sortRange(services, parsedRange, sortCol, order)
  }

  function handleFilter() {
    if (!parsedRange) return
    filterRange(services, parsedRange, filterCol, filterValue)
    if (filterValue.trim()) setFilterActive(true)
  }

  function handleClearFilter() {
    if (!parsedRange) return
    clearFilter(services, parsedRange)
    setFilterActive(false)
    setFilterValue('')
  }

  const colOpts = parsedRange ? columnOptions(parsedRange.startCol, parsedRange.endCol) : []

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
      {/* Range input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={LABEL}>Range</span>
        <input
          type="text"
          value={rangeStr}
          onChange={(e) => updateRange(e.target.value)}
          style={{ ...INPUT_STYLE, borderColor: rangeError ? 'var(--cloistr-error)' : 'var(--cloistr-border)' }}
          aria-label="Range (e.g. A1:D100)"
          placeholder="A1:Z100"
        />
        {rangeError && (
          <span style={{ fontSize: '0.75rem', color: 'var(--cloistr-error)' }}>{rangeError}</span>
        )}
      </div>

      <div style={DIVIDER} role="separator" />

      {/* Sort section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={LABEL}>Sort by</span>
        <select
          value={sortCol}
          onChange={(e) => setSortCol(Number(e.target.value))}
          style={SELECT_STYLE}
          aria-label="Sort column"
          disabled={!parsedRange}
        >
          {colOpts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          style={BTN}
          onClick={() => handleSort('asc')}
          disabled={!parsedRange}
          title="Sort ascending (A to Z)"
        >
          A→Z
        </button>
        <button
          style={BTN}
          onClick={() => handleSort('desc')}
          disabled={!parsedRange}
          title="Sort descending (Z to A)"
        >
          Z→A
        </button>
      </div>

      <div style={DIVIDER} role="separator" />

      {/* Filter section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={LABEL}>Filter col</span>
        <select
          value={filterCol}
          onChange={(e) => setFilterCol(Number(e.target.value))}
          style={SELECT_STYLE}
          aria-label="Filter column"
          disabled={!parsedRange}
        >
          {colOpts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span style={LABEL}>contains</span>
        <input
          type="text"
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleFilter() }}
          style={INPUT_STYLE}
          aria-label="Filter value"
          placeholder="search…"
          disabled={!parsedRange}
        />
        <button
          style={BTN_PRIMARY}
          onClick={handleFilter}
          disabled={!parsedRange || !filterValue.trim()}
          title="Apply filter"
        >
          Apply
        </button>
        {filterActive && (
          <button
            style={{ ...BTN, borderColor: 'var(--cloistr-warning)', color: 'var(--cloistr-warning)' }}
            onClick={handleClearFilter}
            title="Clear filter — show all rows"
          >
            Clear filter
          </button>
        )}
      </div>
    </div>
  )
}
