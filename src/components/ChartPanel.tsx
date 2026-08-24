/**
 * ChartPanel — render bar, line, or pie charts from a selected cell range.
 *
 * Pure SVG rendering — no external charting library. The chart reads directly
 * from Univer's workbook cellData each time the user clicks "Draw Chart", so
 * it reflects the current state of the sheet.
 *
 * Touch/mobile notes:
 * - All buttons are min-height 44px (tap-target requirement).
 * - The chart SVG is responsive (viewBox + 100% width).
 * - Panel wraps on narrow viewports (flex-wrap).
 */
import { useState } from 'react'
import { extractChartData, type ChartData } from '../lib/chart-data.js'
import { univCellDataToGrid } from '../lib/import-export.js'
import { parseRangeString } from '../lib/sort-filter.js'

export type ChartType = 'bar' | 'line' | 'pie'

interface ChartPanelProps {
  workbook: any
  unitId: string
  sheetId: string
}

// Design tokens via CSS variables — no hardcoded colours.
const SERIES_COLORS = [
  'var(--chart-s1, #3b82f6)',
  'var(--chart-s2, #10b981)',
  'var(--chart-s3, #f59e0b)',
  'var(--chart-s4, #ef4444)',
  'var(--chart-s5, #8b5cf6)',
  'var(--chart-s6, #06b6d4)',
]

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

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  backgroundColor: 'var(--cloistr-info)',
  color: '#fff',
  borderColor: 'var(--cloistr-info)',
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG chart renderers
// ─────────────────────────────────────────────────────────────────────────────

const W = 600
const H = 300
const PAD = { top: 20, right: 20, bottom: 60, left: 50 }
const CHART_W = W - PAD.left - PAD.right
const CHART_H = H - PAD.top - PAD.bottom

function BarChart({ data }: { data: ChartData }) {
  if (data.labels.length === 0 || data.series.length === 0) return <NoData />

  const allValues = data.series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const maxVal = Math.max(0, ...allValues)
  const minVal = Math.min(0, ...allValues)
  const range = maxVal - minVal || 1

  const groupCount = data.labels.length
  const seriesCount = data.series.length
  const groupW = CHART_W / groupCount
  const barW = Math.max(2, groupW / (seriesCount + 1))
  const zeroY = PAD.top + CHART_H * (1 - (0 - minVal) / range)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Bar chart">
      {/* Y axis */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CHART_H} stroke="var(--cloistr-border)" />
      {/* X axis (zero line) */}
      <line x1={PAD.left} y1={zeroY} x2={PAD.left + CHART_W} y2={zeroY} stroke="var(--cloistr-border)" />

      {/* Y axis ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD.top + CHART_H * (1 - t)
        const val = minVal + range * t
        return (
          <g key={t}>
            <line x1={PAD.left - 4} y1={y} x2={PAD.left} y2={y} stroke="var(--cloistr-border)" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--cloistr-text-muted)">
              {fmtNum(val)}
            </text>
          </g>
        )
      })}

      {/* Bars */}
      {data.series.map((series, si) =>
        series.values.map((val, gi) => {
          if (val === null) return null
          const x0 = PAD.left + gi * groupW + (si + 0.5) * barW - barW / 2
          const y1 = Math.min(zeroY, PAD.top + CHART_H * (1 - (val - minVal) / range))
          const barH = Math.abs(zeroY - (PAD.top + CHART_H * (1 - (val - minVal) / range)))
          return (
            <rect key={`${si}-${gi}`} x={x0} y={y1} width={barW} height={Math.max(1, barH)}
              fill={SERIES_COLORS[si % SERIES_COLORS.length]} opacity={0.85} rx={2}>
              <title>{series.name}: {val}</title>
            </rect>
          )
        })
      )}

      {/* X labels */}
      {data.labels.map((label, gi) => {
        const x = PAD.left + gi * groupW + groupW / 2
        return (
          <text key={gi} x={x} y={PAD.top + CHART_H + 16} textAnchor="middle" fontSize={10} fill="var(--cloistr-text-muted)">
            {label.length > 10 ? label.slice(0, 9) + '…' : label}
          </text>
        )
      })}

      <Legend series={data.series} />
    </svg>
  )
}

function LineChart({ data }: { data: ChartData }) {
  if (data.labels.length === 0 || data.series.length === 0) return <NoData />

  const allValues = data.series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const maxVal = Math.max(0, ...allValues)
  const minVal = Math.min(0, ...allValues)
  const range = maxVal - minVal || 1
  const n = data.labels.length

  function xPos(i: number) { return PAD.left + (i / Math.max(1, n - 1)) * CHART_W }
  function yPos(v: number) { return PAD.top + CHART_H * (1 - (v - minVal) / range) }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Line chart">
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CHART_H} stroke="var(--cloistr-border)" />
      <line x1={PAD.left} y1={PAD.top + CHART_H} x2={PAD.left + CHART_W} y2={PAD.top + CHART_H} stroke="var(--cloistr-border)" />

      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD.top + CHART_H * (1 - t)
        const val = minVal + range * t
        return (
          <g key={t}>
            <line x1={PAD.left - 4} y1={y} x2={PAD.left + CHART_W} y2={y} stroke="var(--cloistr-border)" strokeDasharray="3,3" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="var(--cloistr-text-muted)">
              {fmtNum(val)}
            </text>
          </g>
        )
      })}

      {data.series.map((series, si) => {
        const color = SERIES_COLORS[si % SERIES_COLORS.length]
        const points = series.values
          .map((v, i) => v !== null ? `${xPos(i)},${yPos(v)}` : null)
          .filter(Boolean)

        // Break the polyline at null values.
        const segments: string[][] = []
        let current: string[] = []
        series.values.forEach((v, i) => {
          if (v !== null) {
            current.push(`${xPos(i)},${yPos(v)}`)
          } else {
            if (current.length > 0) segments.push(current)
            current = []
          }
        })
        if (current.length > 0) segments.push(current)

        return (
          <g key={si}>
            {segments.map((seg, segi) => (
              <polyline key={segi} points={seg.join(' ')} fill="none" stroke={color} strokeWidth={2} />
            ))}
            {points.map((pt, i) => {
              if (!pt) return null
              const [px, py] = pt.split(',').map(Number)
              return (
                <circle key={i} cx={px} cy={py} r={3} fill={color}>
                  <title>{series.name}: {series.values[i]}</title>
                </circle>
              )
            })}
          </g>
        )
      })}

      {data.labels.map((label, i) => (
        <text key={i} x={xPos(i)} y={PAD.top + CHART_H + 16} textAnchor="middle" fontSize={10} fill="var(--cloistr-text-muted)">
          {label.length > 10 ? label.slice(0, 9) + '…' : label}
        </text>
      ))}

      <Legend series={data.series} />
    </svg>
  )
}

function PieChart({ data }: { data: ChartData }) {
  // For pie charts, use the first series only.
  if (data.labels.length === 0 || data.series.length === 0) return <NoData />

  // series[0] is guaranteed non-null: we checked data.series.length === 0 above.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const series = data.series[0]!
  const values = series.values.map((v) => (v === null || v < 0 ? 0 : v))
  const total = values.reduce((a, b) => a + b, 0)
  if (total === 0) return <NoData />

  const cx = W / 3
  const cy = H / 2
  const r = Math.min(CHART_W / 2.5, CHART_H / 2) - 10

  let angle = -Math.PI / 2 // start at top
  const slices = values.map((v, i) => {
    const sweep = (v / total) * 2 * Math.PI
    const startAngle = angle
    angle += sweep
    // data.labels has the same length as values (both derived from the same data
    // rows), so i is always in-bounds. The fallback is a safety net only.
    const label = data.labels[i] ?? String(i + 1)
    return { startAngle, endAngle: angle, value: v, label, i }
  })

  function arcPath(start: number, end: number, outerR: number) {
    const x1 = cx + outerR * Math.cos(start)
    const y1 = cy + outerR * Math.sin(start)
    const x2 = cx + outerR * Math.cos(end)
    const y2 = cy + outerR * Math.sin(end)
    const largeArc = end - start > Math.PI ? 1 : 0
    return `M ${cx} ${cy} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Pie chart">
      {slices.map(({ startAngle, endAngle, value, label, i }) => (
        <path key={i} d={arcPath(startAngle, endAngle, r)}
          fill={SERIES_COLORS[i % SERIES_COLORS.length]}
          stroke="var(--cloistr-bg)" strokeWidth={1} opacity={0.9}>
          <title>{label}: {value} ({((value / total) * 100).toFixed(1)}%)</title>
        </path>
      ))}

      {/* Legend labels on the right */}
      {slices.map(({ value, label, i }) => (
        <g key={i} transform={`translate(${cx + r + 30}, ${H / 2 - (slices.length / 2) * 18 + i * 18})`}>
          <rect width={12} height={12} y={-10} fill={SERIES_COLORS[i % SERIES_COLORS.length]} rx={2} />
          <text x={16} fontSize={11} fill="var(--cloistr-text)">
            {label.length > 14 ? label.slice(0, 13) + '…' : label} ({((value / total) * 100).toFixed(0)}%)
          </text>
        </g>
      ))}
    </svg>
  )
}

function Legend({ series }: { series: ChartData['series'] }) {
  return (
    <g transform={`translate(${PAD.left}, ${H - 15})`}>
      {series.map((s, i) => (
        <g key={i} transform={`translate(${i * 100}, 0)`}>
          <rect width={10} height={10} y={-9} fill={SERIES_COLORS[i % SERIES_COLORS.length]} rx={2} />
          <text x={14} fontSize={10} fill="var(--cloistr-text-muted)">{s.name.length > 8 ? s.name.slice(0, 7) + '…' : s.name}</text>
        </g>
      ))}
    </g>
  )
}

function NoData() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={14} fill="var(--cloistr-text-muted)">
        No data — check range and ensure cells contain numeric values
      </text>
    </svg>
  )
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

export function ChartPanel({ workbook, unitId, sheetId }: ChartPanelProps) {
  const [rangeStr, setRangeStr] = useState('A1:C10')
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [chartData, setChartData] = useState<ChartData | null>(null)

  function drawChart() {
    const parsed = parseRangeString(rangeStr, unitId, sheetId)
    if (!parsed) {
      setRangeError('Invalid range — use A1:D100 format')
      return
    }
    setRangeError(null)

    const sheet =
      workbook.getSheetBySheetId?.(sheetId) ??
      workbook.getActiveSheet?.()

    const cellData = sheet?.getConfig?.()?.cellData ?? {}
    const grid = univCellDataToGrid(cellData)

    const data = extractChartData(
      grid,
      parsed.startRow,
      parsed.endRow,
      parsed.startCol,
      parsed.endCol,
    )
    setChartData(data)
  }

  return (
    <div style={{
      backgroundColor: 'var(--cloistr-bg)',
      borderBottom: '1px solid var(--cloistr-border)',
    }}>
      {/* Controls row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.375rem 0.75rem',
        borderBottom: '1px solid var(--cloistr-border)',
      }}>
        <span style={LABEL}>Chart</span>

        {/* Chart type selector */}
        <div role="group" aria-label="Chart type" style={{ display: 'flex', gap: '0.25rem' }}>
          {(['bar', 'line', 'pie'] as ChartType[]).map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              style={{
                ...BTN,
                backgroundColor: chartType === t ? 'var(--cloistr-info)' : 'var(--cloistr-bg-hover)',
                color: chartType === t ? '#fff' : 'var(--cloistr-text)',
                borderColor: chartType === t ? 'var(--cloistr-info)' : 'var(--cloistr-border)',
                minHeight: 44,
                padding: '0 0.625rem',
              }}
              aria-pressed={chartType === t}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Range input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <label htmlFor="chart-range" style={LABEL}>Range</label>
          <input
            id="chart-range"
            type="text"
            value={rangeStr}
            onChange={(e) => { setRangeStr(e.target.value); setRangeError(null) }}
            style={{ ...INPUT_STYLE, borderColor: rangeError ? 'var(--cloistr-error)' : 'var(--cloistr-border)' }}
            aria-describedby={rangeError ? 'chart-range-error' : undefined}
            placeholder="e.g. A1:C10"
          />
          {rangeError && (
            <span id="chart-range-error" style={{ fontSize: '0.75rem', color: 'var(--cloistr-error)' }}>
              {rangeError}
            </span>
          )}
        </div>

        <button onClick={drawChart} style={BTN_PRIMARY} aria-label="Draw chart from selected range">
          Draw
        </button>

        {chartData && (
          <button
            onClick={() => setChartData(null)}
            style={BTN}
            aria-label="Clear chart"
          >
            Clear
          </button>
        )}
      </div>

      {/* Chart area */}
      {chartData && (
        <div style={{ padding: '0.75rem', overflowX: 'auto' }}>
          <div style={{ minWidth: '280px', maxWidth: '700px', margin: '0 auto' }}>
            {chartType === 'bar' && <BarChart data={chartData} />}
            {chartType === 'line' && <LineChart data={chartData} />}
            {chartType === 'pie' && <PieChart data={chartData} />}
            {chartData.hasHeader && (
              <p style={{ fontSize: '0.7rem', color: 'var(--cloistr-text-muted)', marginTop: '0.25rem', marginBottom: 0 }}>
                First row used as header (series names / x-axis labels).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
