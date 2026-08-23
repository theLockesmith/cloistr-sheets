/**
 * CSV import/export and XLSX export for Cloistr Sheets.
 *
 * All functions are pure or near-pure: they receive cell data as plain objects
 * so they can be tested without a live Univer instance.
 *
 * XLSX export uses the 'xlsx' package (SheetJS community edition, Apache-2.0).
 * CSV is implemented inline — no extra dependency.
 *
 * DESIGN NOTE — why we handle cell data ourselves rather than letting Univer
 * do it:
 *   Univer 0.1.x has no built-in import/export API. The packages that wrap it
 *   (e.g. @univerjs/sheets-io) are not in the installed set and cannot be added
 *   without a version-coordinated bump. Reading raw cellData and writing back
 *   via set-range-values is the same path the Yjs bridge already uses, so the
 *   approach is proven and consistent.
 */

import * as XLSX from 'xlsx'

/** A sparse row-major grid: rows[r][c] = string cell value (or absent). */
export type CellGrid = Record<number, Record<number, string>>

/** Convert a Univer cellData object to a normalised string grid. */
export function univCellDataToGrid(cellData: Record<number, Record<number, any>>): CellGrid {
  const grid: CellGrid = {}
  for (const [rStr, cols] of Object.entries(cellData ?? {})) {
    const r = Number(rStr)
    if (!cols) continue
    grid[r] = {}
    for (const [cStr, cell] of Object.entries(cols)) {
      const c = Number(cStr)
      if (cell == null) continue
      // Prefer the raw value (v), fall back to display text (m).
      const raw = cell.v ?? cell.m
      grid[r][c] = raw == null ? '' : String(raw)
    }
  }
  return grid
}

/** Determine the inclusive bounding box [maxRow, maxCol] of a grid. */
function bounds(grid: CellGrid): { maxRow: number; maxCol: number } {
  let maxRow = 0
  let maxCol = 0
  for (const [rStr, cols] of Object.entries(grid)) {
    const r = Number(rStr)
    if (r > maxRow) maxRow = r
    for (const cStr of Object.keys(cols)) {
      const c = Number(cStr)
      if (c > maxCol) maxCol = c
    }
  }
  return { maxRow, maxCol }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialise a grid to CSV text (RFC 4180 compliant).
 * Cells containing commas, double-quotes, or newlines are quoted.
 */
export function gridToCSV(grid: CellGrid): string {
  const { maxRow, maxCol } = bounds(grid)
  const lines: string[] = []
  for (let r = 0; r <= maxRow; r++) {
    const cells: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const raw = grid[r]?.[c] ?? ''
      // RFC 4180 quoting: wrap in double-quotes if the value contains a
      // double-quote, comma, or newline; escape inner double-quotes by doubling.
      if (raw.includes('"') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
        cells.push('"' + raw.replace(/"/g, '""') + '"')
      } else {
        cells.push(raw)
      }
    }
    lines.push(cells.join(','))
  }
  return lines.join('\r\n')
}

/**
 * Parse CSV text into a grid.
 * Handles RFC 4180 quoting, CRLF and LF line endings.
 */
export function csvToGrid(csv: string): CellGrid {
  const grid: CellGrid = {}
  // Normalise line endings.
  const text = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  let row = 0
  let col = 0
  let pos = 0
  const len = text.length

  while (pos <= len) {
    let cell = ''
    if (pos < len && text[pos] === '"') {
      // Quoted field
      pos++ // skip opening quote
      while (pos < len) {
        if (text[pos] === '"') {
          if (text[pos + 1] === '"') {
            cell += '"'
            pos += 2
          } else {
            pos++ // skip closing quote
            break
          }
        } else {
          cell += text[pos++]
        }
      }
    } else {
      // Unquoted field — read until comma or newline or end
      while (pos < len && text[pos] !== ',' && text[pos] !== '\n') {
        cell += text[pos++]
      }
    }

    // Store the cell value (only non-empty to keep CellGrid sparse-ish).
    if (cell !== '') {
      if (!grid[row]) grid[row] = {}
      // grid[row] is always defined — set just above.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      grid[row]![col] = cell
    }

    // Advance past the field separator.
    if (pos >= len) break
    if (text[pos] === ',') {
      col++
      pos++
    } else if (text[pos] === '\n') {
      row++
      col = 0
      pos++
    }
  }

  return grid
}

/**
 * Convert a grid to a Univer cellData object (for writing via set-range-values).
 * Values are stored as strings; Univer's formula engine will cast as needed.
 */
export function gridToUniverCellData(
  grid: CellGrid,
): Record<number, Record<number, { v: string | number }>> {
  const cellData: Record<number, Record<number, { v: string | number }>> = {}
  for (const [rStr, cols] of Object.entries(grid)) {
    const r = Number(rStr)
    cellData[r] = {}
    for (const [cStr, value] of Object.entries(cols)) {
      const c = Number(cStr)
      // Coerce to number when the value looks numeric.
      const n = Number(value)
      cellData[r][c] = { v: value !== '' && !isNaN(n) ? n : value }
    }
  }
  return cellData
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialise a grid to XLSX binary data (as an ArrayBuffer).
 * The sheet is named 'Sheet1'.
 */
export function gridToXLSX(grid: CellGrid, sheetName = 'Sheet1'): ArrayBuffer {
  const { maxRow, maxCol } = bounds(grid)

  // Build a 2D array for sheet_from_array_of_arrays.
  const rows: Array<Array<string | number>> = []
  for (let r = 0; r <= maxRow; r++) {
    const row: Array<string | number> = []
    for (let c = 0; c <= maxCol; c++) {
      const val = grid[r]?.[c] ?? ''
      const n = Number(val)
      row.push(val !== '' && !isNaN(n) ? n : val)
    }
    rows.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // write returns an ArrayBuffer when type is 'array'
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  // Build an anchor, append, click, then remove — avoids the <a download> sandbox
  // restriction that blocks <a href=data:…> clicks. createObjectURL is a blob:
  // URL, which the sandbox does allow to be navigated to from a user gesture.
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
