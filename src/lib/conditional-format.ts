/**
 * Conditional formatting rules for Cloistr Sheets.
 *
 * Rules are evaluated against a range of cells; matching cells receive a
 * background-color style (Univer's `bg.rgb`). The style is applied via
 * `sheet.mutation.set-range-values` so the bridge syncs it to Yjs and all
 * collaborators see the same highlighting.
 *
 * Only one rule type is implemented in this release: "cell value comparison"
 * (greater than, less than, equal to, etc.). Text-contains and date rules
 * can follow the same pattern using a different predicate.
 */

import type { SortFilterServices } from './sort-filter.js'

export type ConditionOp =
  | 'gt'   // >
  | 'gte'  // >=
  | 'lt'   // <
  | 'lte'  // <=
  | 'eq'   // =
  | 'neq'  // !=
  | 'contains'   // substring (case-insensitive)
  | 'not_empty'  // non-blank

export interface ConditionalRule {
  op: ConditionOp
  /** Comparison value (unused for not_empty). */
  value: string
  /** CSS-compatible hex or rgb color, e.g. '#fde047' */
  color: string
}

/**
 * Apply a conditional formatting rule to every cell in a rectangular range.
 *
 * Matching cells have their `bg.rgb` set to the rule color.
 * Non-matching cells are NOT cleared — call clearConditionalFormat() first if
 * you want to reset the range before re-applying.
 */
export function applyConditionalFormat(
  services: SortFilterServices,
  rule: ConditionalRule,
  unitId: string,
  sheetId: string,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): void {
  const { commandService, workbook } = services
  const sheet =
    workbook.getSheetBySheetId?.(sheetId) ??
    workbook.getActiveSheet?.()

  const cellData: Record<number, Record<number, any>> =
    sheet?.getConfig?.()?.cellData ?? {}

  const cellValue: Record<number, Record<number, any>> = {}

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = cellData[r]?.[c]
      const raw = cell == null ? '' : String(cell.v ?? cell.m ?? '')

      if (matches(rule, raw)) {
        if (!cellValue[r]) cellValue[r] = {}
        // Merge with existing cell to preserve the value.
        // cellValue[r] is always defined — set just above.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        cellValue[r]![c] = {
          ...(cell ?? {}),
          s: {
            ...(cell?.s ?? {}),
            bg: { rgb: rule.color },
          },
        }
      }
    }
  }

  if (Object.keys(cellValue).length === 0) return

  commandService.syncExecuteCommand('sheet.mutation.set-range-values', {
    unitId,
    subUnitId: sheetId,
    cellValue,
  })
}

/**
 * Remove the `bg.rgb` style from every cell in a range (reset backgrounds).
 * Does not touch cell values.
 */
export function clearConditionalFormat(
  services: SortFilterServices,
  unitId: string,
  sheetId: string,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): void {
  const { commandService, workbook } = services
  const sheet =
    workbook.getSheetBySheetId?.(sheetId) ??
    workbook.getActiveSheet?.()

  const cellData: Record<number, Record<number, any>> =
    sheet?.getConfig?.()?.cellData ?? {}

  const cellValue: Record<number, Record<number, any>> = {}

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = cellData[r]?.[c]
      if (!cell?.s?.bg) continue // nothing to clear

      const { bg: _bg, ...restStyle } = cell.s
      if (!cellValue[r]) cellValue[r] = {}
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      cellValue[r]![c] = {
        ...cell,
        s: Object.keys(restStyle).length > 0 ? restStyle : null,
      }
    }
  }

  if (Object.keys(cellValue).length === 0) return

  commandService.syncExecuteCommand('sheet.mutation.set-range-values', {
    unitId,
    subUnitId: sheetId,
    cellValue,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Predicate
// ─────────────────────────────────────────────────────────────────────────────

function matches(rule: ConditionalRule, raw: string): boolean {
  const { op, value } = rule

  if (op === 'not_empty') return raw.trim() !== ''
  if (op === 'contains') return raw.toLowerCase().includes(value.toLowerCase())

  // Numeric comparison.
  const cellNum = Number(raw)
  const ruleNum = Number(value)

  if (isNaN(cellNum) || isNaN(ruleNum)) {
    // If the rule value is numeric but the cell is not (or vice versa),
    // ordering operators never match — comparing 'Label' > 100 as strings
    // would give a meaningless result. Only equality/inequality are valid.
    if (!isNaN(ruleNum) || !isNaN(cellNum)) {
      // Mixed numeric/string: only eq/neq are meaningful.
      switch (op) {
        case 'eq':  return raw === value
        case 'neq': return raw !== value
        default:    return false
      }
    }
    // Both non-numeric: lexicographic string comparison.
    switch (op) {
      case 'gt':  return raw > value
      case 'gte': return raw >= value
      case 'lt':  return raw < value
      case 'lte': return raw <= value
      case 'eq':  return raw === value
      case 'neq': return raw !== value
    }
  }

  switch (op) {
    case 'gt':  return cellNum > ruleNum
    case 'gte': return cellNum >= ruleNum
    case 'lt':  return cellNum < ruleNum
    case 'lte': return cellNum <= ruleNum
    case 'eq':  return cellNum === ruleNum
    case 'neq': return cellNum !== ruleNum
  }
}
