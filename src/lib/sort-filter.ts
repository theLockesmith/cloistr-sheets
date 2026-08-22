/**
 * Sort and filter operations on a column range, wired through Univer's
 * command service.
 *
 * SORT goes through `sheet.mutation.set-range-values`, so the bridge's
 * onCommand handler picks it up and syncs the result to Yjs. Collaborators
 * see the sorted data without any extra plumbing.
 *
 * FILTER (hide/show rows) uses `sheet.mutation.set-row-hidden` and
 * `sheet.mutation.set-row-visible`. These are view-only operations — they are
 * intentionally NOT in the bridge's CELL_MUTATIONS set, so filter state is
 * local. That is the standard spreadsheet model: filters are per-user
 * viewport, not shared data. Calling clearFilter() restores all rows.
 *
 * Both operations require the resolved Univer services — the same
 * {commandService, workbook} pair that attachBridge uses internally.
 * Sheet.tsx exposes them via BridgeHandle.services.
 */

/** Resolved Univer services the bridge already retrieves. */
export interface SortFilterServices {
  commandService: any
  workbook: any
}

/**
 * A rectangular range of cells on a specific sheet.
 * All indices are 0-based (row 0 = row 1 in the UI).
 */
export interface RangeSpec {
  /** Yjs/Univer unit id (workbook) */
  unitId: string
  /** Sheet id within the workbook */
  sheetId: string
  /** First data row (inclusive). Row 0 is treated as the header. */
  startRow: number
  /** Last data row (inclusive). */
  endRow: number
  /** First column in the range (inclusive, 0-based). */
  startCol: number
  /** Last column in the range (inclusive, 0-based). */
  endCol: number
}

export type SortOrder = 'asc' | 'desc'

// ─────────────────────────────────────────────────────────────────────────────
// Sort
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sort the rows of `range` by the values in column `keyCol`.
 *
 * The first row (startRow) is treated as a header and is never moved.
 * Data rows startRow+1 … endRow are reordered. Values are compared
 * numerically when both parse as numbers; otherwise as case-insensitive
 * strings. Empty cells sort last.
 *
 * The sorted data is written back via `sheet.mutation.set-range-values`.
 * The bridge's onCommand handler sees this mutation and syncs Yjs, so
 * the sort is automatically persisted and shared with collaborators.
 */
export function sortRange(
  services: SortFilterServices,
  range: RangeSpec,
  keyCol: number,
  order: SortOrder,
): void {
  const { commandService, workbook } = services
  const sheet =
    workbook.getSheetBySheetId?.(range.sheetId) ??
    workbook.getActiveSheet?.()

  const cellData: Record<number, Record<number, any>> = sheet?.getConfig?.()?.cellData ?? {}

  // Data rows only (skip the header at startRow).
  const dataStart = range.startRow + 1
  if (dataStart > range.endRow) return

  // Snapshot every data row in the range as {row, cells}.
  const rows: Array<{ cells: Record<number, any> }> = []
  for (let r = dataStart; r <= range.endRow; r++) {
    // Clone so we don't mutate the config object in place.
    const cols: Record<number, any> = {}
    for (let c = range.startCol; c <= range.endCol; c++) {
      const cell = cellData[r]?.[c]
      cols[c] = cell !== undefined ? cell : null
    }
    rows.push({ cells: cols })
  }

  // Sort by the key column.
  rows.sort((a, b) => {
    const av = extractSortValue(a.cells[keyCol])
    const bv = extractSortValue(b.cells[keyCol])
    const cmp = compareValues(av, bv)
    return order === 'asc' ? cmp : -cmp
  })

  // Build the set-range-values payload.
  const cellValue: Record<number, Record<number, any>> = {}
  rows.forEach(({ cells }, idx) => {
    const targetRow = dataStart + idx
    cellValue[targetRow] = {}
    for (let c = range.startCol; c <= range.endCol; c++) {
      // null clears a cell that previously had content.
      cellValue[targetRow][c] = cells[c] ?? null
    }
  })

  commandService.syncExecuteCommand('sheet.mutation.set-range-values', {
    unitId: range.unitId,
    subUnitId: range.sheetId,
    cellValue,
  })
}

function extractSortValue(cell: any): string | number | null {
  if (cell == null) return null
  if (typeof cell.v === 'number') return cell.v
  const s = String(cell.v ?? cell.m ?? '').trim()
  const n = Number(s)
  return Number.isNaN(n) ? s.toLowerCase() : n
}

function compareValues(a: string | number | null, b: string | number | null): number {
  // Empty / null sorts last regardless of direction.
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const as = String(a)
  const bs = String(b)
  return as < bs ? -1 : as > bs ? 1 : 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Show only data rows where the cell in `keyCol` contains `value` (case-
 * insensitive substring match). Rows that do not match are hidden via
 * `sheet.mutation.set-row-hidden`. The header row (startRow) is never hidden.
 *
 * Passing an empty `value` is equivalent to calling clearFilter().
 *
 * Filter state is local: it changes row visibility, not cell data, so the
 * bridge does not sync it to Yjs. Each user's viewport is independent.
 */
export function filterRange(
  services: SortFilterServices,
  range: RangeSpec,
  keyCol: number,
  value: string,
): void {
  if (!value.trim()) {
    clearFilter(services, range)
    return
  }

  const { commandService, workbook } = services
  const sheet =
    workbook.getSheetBySheetId?.(range.sheetId) ??
    workbook.getActiveSheet?.()

  const cellData: Record<number, Record<number, any>> = sheet?.getConfig?.()?.cellData ?? {}
  const needle = value.toLowerCase()

  // First restore all rows in the data range (in case a previous filter hid some).
  commandService.syncExecuteCommand('sheet.mutation.set-row-visible', {
    unitId: range.unitId,
    subUnitId: range.sheetId,
    ranges: [{
      startRow: range.startRow + 1,
      endRow: range.endRow,
      startColumn: 0,
      endColumn: 999,
    }],
  })

  // Collect contiguous runs of non-matching rows.
  const hideRanges: Array<{ startRow: number; endRow: number }> = []
  let runStart: number | null = null

  for (let r = range.startRow + 1; r <= range.endRow; r++) {
    const cell = cellData[r]?.[keyCol]
    const haystack = String(cell?.v ?? cell?.m ?? '').toLowerCase()
    const matches = haystack.includes(needle)

    if (!matches) {
      if (runStart === null) runStart = r
    } else {
      if (runStart !== null) {
        hideRanges.push({ startRow: runStart, endRow: r - 1 })
        runStart = null
      }
    }
  }
  if (runStart !== null) {
    hideRanges.push({ startRow: runStart, endRow: range.endRow })
  }

  if (hideRanges.length > 0) {
    commandService.syncExecuteCommand('sheet.mutation.set-row-hidden', {
      unitId: range.unitId,
      subUnitId: range.sheetId,
      ranges: hideRanges.map(({ startRow, endRow }) => ({
        startRow,
        endRow,
        startColumn: 0,
        endColumn: 999,
      })),
    })
  }
}

/**
 * Restore all rows in `range` to visible, clearing any active filter.
 */
export function clearFilter(
  services: SortFilterServices,
  range: RangeSpec,
): void {
  services.commandService.syncExecuteCommand('sheet.mutation.set-row-visible', {
    unitId: range.unitId,
    subUnitId: range.sheetId,
    ranges: [{
      startRow: range.startRow,
      endRow: range.endRow,
      startColumn: 0,
      endColumn: 999,
    }],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Range parsing helpers (used by the UI panel)
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a column letter (A-Z, or multi-letter AA-ZZ) to 0-based column index. */
export function colLetterToIndex(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

/** Convert a 0-based column index to a letter label (0→A, 25→Z, 26→AA). */
export function colIndexToLetter(idx: number): string {
  let s = ''
  let n = idx + 1
  while (n > 0) {
    s = String.fromCharCode(64 + (n % 26 || 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * Parse a range string like "A1:D100" into a RangeSpec.
 * Returns null if the string is malformed.
 */
export function parseRangeString(
  rangeStr: string,
  unitId: string,
  sheetId: string,
): RangeSpec | null {
  const m = rangeStr.trim().toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
  if (!m) return null
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [, sc, sr, ec, er] = m as [string, string, string, string, string]
  const startRow = parseInt(sr, 10) - 1
  const endRow = parseInt(er, 10) - 1
  const startCol = colLetterToIndex(sc)
  const endCol = colLetterToIndex(ec)
  if (startRow > endRow || startCol > endCol) return null
  return { unitId, sheetId, startRow, endRow, startCol, endCol }
}
