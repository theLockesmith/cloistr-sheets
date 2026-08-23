/**
 * Chart data extraction from a Univer cell grid.
 *
 * Reads a rectangular range and interprets it as:
 *   - Column A (first column): category labels (x-axis / pie slice labels)
 *   - Column B onward: numeric series
 *
 * If the first row looks like a header (first cell is non-numeric), the row is
 * treated as series names and excluded from the data.
 *
 * This keeps the extraction logic pure and independently testable.
 */

import type { CellGrid } from './import-export.js'

export interface ChartSeries {
  name: string
  values: Array<number | null>
}

export interface ChartData {
  labels: string[]
  series: ChartSeries[]
  hasHeader: boolean
}

/**
 * Extract chart data from the intersection of `grid` and `range`.
 *
 * @param grid   Sparse string grid (from univCellDataToGrid)
 * @param startRow 0-based inclusive
 * @param endRow   0-based inclusive
 * @param startCol 0-based inclusive (label column)
 * @param endCol   0-based inclusive (last data column)
 */
export function extractChartData(
  grid: CellGrid,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): ChartData {
  if (startRow > endRow || startCol > endCol) {
    return { labels: [], series: [], hasHeader: false }
  }

  // Detect header: first cell of the first row is non-numeric (or empty).
  const firstCell = grid[startRow]?.[startCol] ?? ''
  const hasHeader = firstCell === '' || isNaN(Number(firstCell))

  const dataStartRow = hasHeader ? startRow + 1 : startRow
  if (dataStartRow > endRow) {
    return { labels: [], series: [], hasHeader }
  }

  // Collect series names from the header row (if present).
  const seriesNames: string[] = []
  if (hasHeader) {
    for (let c = startCol + 1; c <= endCol; c++) {
      seriesNames.push(grid[startRow]?.[c] ?? `Series ${c - startCol}`)
    }
  } else {
    for (let c = startCol + 1; c <= endCol; c++) {
      seriesNames.push(`Series ${c - startCol}`)
    }
  }

  const labels: string[] = []
  const seriesData: Array<Array<number | null>> = seriesNames.map(() => [])

  for (let r = dataStartRow; r <= endRow; r++) {
    // Label column.
    labels.push(grid[r]?.[startCol] ?? String(r - dataStartRow + 1))

    for (let si = 0; si < seriesNames.length; si++) {
      const c = startCol + 1 + si
      const raw = grid[r]?.[c] ?? ''
      const n = Number(raw)
      // seriesData[si] is always defined — the array was seeded with one entry
      // per series, so si is always in bounds. The non-null assertion is safe.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      seriesData[si]!.push(raw !== '' && !isNaN(n) ? n : null)
    }
  }

  const series: ChartSeries[] = seriesNames.map((name, i) => ({
    name,
    // seriesData[i] is always defined — see comment above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    values: seriesData[i]!,
  }))

  return { labels, series, hasHeader }
}
