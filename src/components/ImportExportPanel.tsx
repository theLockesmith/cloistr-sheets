/**
 * ImportExportPanel — CSV import/export and XLSX export for Cloistr Sheets.
 *
 * CSV export: reads all cell data from the active Univer sheet and serialises
 * it to RFC 4180 CSV, then triggers a browser download.
 *
 * XLSX export: same data path, produces a proper .xlsx file via SheetJS.
 *
 * CSV import: reads a user-selected .csv file, parses it, and writes it to
 * the sheet starting at A1 via set-range-values (so the bridge syncs to Yjs
 * and saves automatically).
 *
 * Mobile notes:
 * - File input is wrapped in a label so the whole hit area is tappable.
 * - All buttons are min-height 44px.
 */
import { useRef, useState } from 'react'
import {
  univCellDataToGrid,
  gridToCSV,
  csvToGrid,
  gridToUniverCellData,
  gridToXLSX,
  downloadBlob,
} from '../lib/import-export.js'
import type { SortFilterServices } from '../lib/sort-filter.js'

interface ImportExportPanelProps {
  services: SortFilterServices
  unitId: string
  sheetId: string
  /** Human-readable name shown in download filename, e.g. 'Sheet1'. */
  sheetName?: string
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
  display: 'inline-flex',
  alignItems: 'center',
}

const LABEL: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--cloistr-text-muted)',
  fontWeight: 500,
}

export function ImportExportPanel({
  services,
  unitId,
  sheetId,
  sheetName = 'Sheet1',
}: ImportExportPanelProps) {
  const { commandService, workbook } = services
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // ── helpers ──────────────────────────────────────────────────────────────

  function getCurrentGrid() {
    const sheet =
      workbook.getSheetBySheetId?.(sheetId) ??
      workbook.getActiveSheet?.()
    const cellData = sheet?.getConfig?.()?.cellData ?? {}
    return univCellDataToGrid(cellData)
  }

  // ── export ───────────────────────────────────────────────────────────────

  function handleExportCSV() {
    const csv = gridToCSV(getCurrentGrid())
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    downloadBlob(blob, `${sheetName}.csv`)
  }

  function handleExportXLSX() {
    const buf = gridToXLSX(getCurrentGrid(), sheetName)
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    downloadBlob(blob, `${sheetName}.xlsx`)
  }

  // ── import ───────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportStatus(null)
    setImportError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const grid = csvToGrid(text)
        const cellValue = gridToUniverCellData(grid)

        commandService.syncExecuteCommand('sheet.mutation.set-range-values', {
          unitId,
          subUnitId: sheetId,
          cellValue,
        })

        setImportStatus(`Imported ${file.name}`)
        setTimeout(() => setImportStatus(null), 3000)
      } catch (err) {
        setImportError(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    reader.onerror = () => setImportError('Could not read file')
    reader.readAsText(file)

    // Reset so the same file can be re-imported.
    e.target.value = ''
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
      <span style={LABEL}>Import / Export</span>

      {/* Import */}
      <label
        style={{ ...BTN, cursor: 'pointer' }}
        title="Import a CSV file — replaces sheet data starting at A1"
        aria-label="Import CSV file"
      >
        Import CSV
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      </label>

      {/* Export */}
      <button onClick={handleExportCSV} style={BTN} title="Export current sheet as CSV">
        Export CSV
      </button>

      <button onClick={handleExportXLSX} style={BTN} title="Export current sheet as XLSX">
        Export XLSX
      </button>

      {importStatus && (
        <span style={{ fontSize: '0.75rem', color: 'var(--cloistr-success)' }}>{importStatus}</span>
      )}
      {importError && (
        <span style={{ fontSize: '0.75rem', color: 'var(--cloistr-error)' }}>{importError}</span>
      )}
    </div>
  )
}
