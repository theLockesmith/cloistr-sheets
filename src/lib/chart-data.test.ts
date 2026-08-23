/**
 * Tests for chart-data.ts
 *
 * Source-level unit tests: no DOM, no Univer instance.
 */
import { describe, it, expect } from 'vitest'
import { extractChartData } from './chart-data.js'
import type { CellGrid } from './import-export.js'

describe('extractChartData', () => {
  const grid: CellGrid = {
    0: { 0: 'Month', 1: 'Revenue', 2: 'Costs' },
    1: { 0: 'Jan', 1: '1000', 2: '700' },
    2: { 0: 'Feb', 1: '1200', 2: '800' },
    3: { 0: 'Mar', 1: '900', 2: '600' },
  }

  it('detects header row', () => {
    const d = extractChartData(grid, 0, 3, 0, 2)
    expect(d.hasHeader).toBe(true)
    expect(d.labels).toEqual(['Jan', 'Feb', 'Mar'])
  })

  it('extracts series names from header', () => {
    const d = extractChartData(grid, 0, 3, 0, 2)
    expect(d.series).toHaveLength(2)
    // Use non-null assertions: the length check above guarantees these exist.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(d.series[0]!.name).toBe('Revenue')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(d.series[1]!.name).toBe('Costs')
  })

  it('extracts numeric series values', () => {
    const d = extractChartData(grid, 0, 3, 0, 2)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(d.series[0]!.values).toEqual([1000, 1200, 900])
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(d.series[1]!.values).toEqual([700, 800, 600])
  })

  it('treats non-numeric cells as null', () => {
    const g: CellGrid = {
      0: { 0: 'A', 1: '10' },
      1: { 0: 'B', 1: 'n/a' },
    }
    const d = extractChartData(g, 0, 1, 0, 1)
    // Row 0 is header (first cell 'A' is non-numeric)
    expect(d.hasHeader).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(d.series[0]!.values).toEqual([null])
  })

  it('handles no-header grids (first cell is numeric)', () => {
    const g: CellGrid = {
      0: { 0: '1', 1: '10' },
      1: { 0: '2', 1: '20' },
    }
    const d = extractChartData(g, 0, 1, 0, 1)
    expect(d.hasHeader).toBe(false)
    expect(d.labels).toEqual(['1', '2'])
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(d.series[0]!.values).toEqual([10, 20])
  })

  it('returns empty result for inverted range', () => {
    const d = extractChartData(grid, 5, 3, 0, 2)
    expect(d.labels).toHaveLength(0)
    expect(d.series).toHaveLength(0)
  })

  it('returns empty result when data range is empty after header', () => {
    const g: CellGrid = { 0: { 0: 'Label', 1: 'Value' } }
    const d = extractChartData(g, 0, 0, 0, 1)
    expect(d.hasHeader).toBe(true)
    expect(d.labels).toHaveLength(0)
  })

  it('uses generated series names when no header', () => {
    const g: CellGrid = { 0: { 0: '100', 1: '200', 2: '300' } }
    const d = extractChartData(g, 0, 0, 0, 2)
    expect(d.hasHeader).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(d.series[0]!.name).toBe('Series 1')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(d.series[1]!.name).toBe('Series 2')
  })
})
