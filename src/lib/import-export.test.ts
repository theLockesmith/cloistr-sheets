/**
 * Tests for import-export.ts
 *
 * These are source-level unit tests — they exercise the pure functions in
 * import-export.ts without mounting a DOM or loading a real Univer instance.
 * XLSX round-trip is tested by re-parsing the output with the xlsx library.
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  univCellDataToGrid,
  gridToCSV,
  csvToGrid,
  gridToUniverCellData,
  gridToXLSX,
  type CellGrid,
} from './import-export.js'

// ─────────────────────────────────────────────────────────────────────────────
// univCellDataToGrid
// ─────────────────────────────────────────────────────────────────────────────

describe('univCellDataToGrid', () => {
  it('converts a simple cellData to a string grid', () => {
    const cd = {
      0: { 0: { v: 'Name' }, 1: { v: 'Age' } },
      1: { 0: { v: 'Alice' }, 1: { v: 30 } },
    }
    const g = univCellDataToGrid(cd)
    expect(g[0]?.[0]).toBe('Name')
    expect(g[0]?.[1]).toBe('Age')
    expect(g[1]?.[0]).toBe('Alice')
    expect(g[1]?.[1]).toBe('30')
  })

  it('falls back to m when v is absent', () => {
    const cd = { 0: { 0: { m: 'display' } } }
    const g = univCellDataToGrid(cd)
    expect(g[0]?.[0]).toBe('display')
  })

  it('skips null cells', () => {
    const cd = { 0: { 0: null, 1: { v: 'x' } } }
    const g = univCellDataToGrid(cd as any)
    expect(g[0]?.[0]).toBeUndefined()
    expect(g[0]?.[1]).toBe('x')
  })

  it('handles empty input', () => {
    expect(univCellDataToGrid({})).toEqual({})
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// gridToCSV / csvToGrid round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('gridToCSV', () => {
  it('produces comma-separated rows', () => {
    const g: CellGrid = { 0: { 0: 'a', 1: 'b' }, 1: { 0: 'c', 1: 'd' } }
    const csv = gridToCSV(g)
    expect(csv).toBe('a,b\r\nc,d')
  })

  it('quotes cells that contain commas', () => {
    const g: CellGrid = { 0: { 0: 'hello, world', 1: 'ok' } }
    const csv = gridToCSV(g)
    expect(csv).toBe('"hello, world",ok')
  })

  it('doubles embedded double-quotes', () => {
    const g: CellGrid = { 0: { 0: 'say "hi"' } }
    const csv = gridToCSV(g)
    expect(csv).toBe('"say ""hi"""')
  })

  it('produces empty cells for missing positions', () => {
    // row 0 has cols 0 and 2 but not col 1
    const g: CellGrid = { 0: { 0: 'a', 2: 'c' } }
    const csv = gridToCSV(g)
    expect(csv).toBe('a,,c')
  })
})

describe('csvToGrid', () => {
  it('round-trips a simple grid', () => {
    const g: CellGrid = { 0: { 0: 'Name', 1: 'Age' }, 1: { 0: 'Alice', 1: '30' } }
    const csv = gridToCSV(g)
    const g2 = csvToGrid(csv)
    expect(g2[0]?.[0]).toBe('Name')
    expect(g2[1]?.[1]).toBe('30')
  })

  it('handles quoted fields with commas', () => {
    const csv = '"hello, world",ok'
    const g = csvToGrid(csv)
    expect(g[0]?.[0]).toBe('hello, world')
    expect(g[0]?.[1]).toBe('ok')
  })

  it('handles doubled quotes inside quoted fields', () => {
    const csv = '"say ""hi"""'
    const g = csvToGrid(csv)
    expect(g[0]?.[0]).toBe('say "hi"')
  })

  it('handles LF line endings', () => {
    const csv = 'a,b\nc,d'
    const g = csvToGrid(csv)
    expect(g[0]?.[0]).toBe('a')
    expect(g[1]?.[0]).toBe('c')
  })

  it('handles CRLF line endings', () => {
    const csv = 'a,b\r\nc,d'
    const g = csvToGrid(csv)
    expect(g[1]?.[1]).toBe('d')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// gridToUniverCellData
// ─────────────────────────────────────────────────────────────────────────────

describe('gridToUniverCellData', () => {
  it('coerces numeric strings to numbers', () => {
    const g: CellGrid = { 0: { 0: '42', 1: 'hello' } }
    const cd = gridToUniverCellData(g)
    expect(cd[0]?.[0]).toEqual({ v: 42 })
    expect(cd[0]?.[1]).toEqual({ v: 'hello' })
  })

  it('leaves empty string as string', () => {
    const g: CellGrid = { 0: { 0: '' } }
    const cd = gridToUniverCellData(g)
    expect(cd[0]?.[0]).toEqual({ v: '' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// gridToXLSX
// ─────────────────────────────────────────────────────────────────────────────

describe('gridToXLSX', () => {
  it('produces a parseable XLSX buffer', () => {
    const g: CellGrid = {
      0: { 0: 'Name', 1: 'Score' },
      1: { 0: 'Alice', 1: '95' },
      2: { 0: 'Bob', 1: '87' },
    }
    const buf = gridToXLSX(g, 'TestSheet')
    // Re-parse with xlsx to verify correctness.
    const wb = XLSX.read(buf, { type: 'array' })
    expect(wb.SheetNames).toContain('TestSheet')
    const ws = wb.Sheets['TestSheet']
    // ws is guaranteed non-null: SheetNames contains 'TestSheet'.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(ws!['A1']?.v).toBe('Name')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(ws!['B2']?.v).toBe(95)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(ws!['A2']?.v).toBe('Alice')
  })

  it('returns an ArrayBuffer', () => {
    const g: CellGrid = { 0: { 0: 'test' } }
    const buf = gridToXLSX(g)
    expect(buf).toBeInstanceOf(ArrayBuffer)
    expect(buf.byteLength).toBeGreaterThan(0)
  })
})
