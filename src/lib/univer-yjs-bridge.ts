/**
 * Bridge Univer's cell data to a Yjs document, in both directions.
 *
 * Before this, `Sheet.tsx` carried:
 *   // TODO: Sync workbook data through Yjs
 *   // For now, create initial sheet - full Yjs <-> Univer bridge needs implementation
 *
 * and the consequences were total: cell edits stayed in Univer's in-memory
 * state and never entered the Yjs doc, so `useDocumentPersistence` (which marks
 * dirty from `ydoc.on('update')`) never saw a change. The Save button stayed
 * disabled forever, no Blossom upload ever fired, every reload restored the
 * hardcoded "Hello / World" sample, and Yjs-based collaboration synced an empty
 * document between peers.
 *
 * DESIGN NOTES
 *
 * Cells are stored flat, keyed `sheetId!row:col`, holding Univer's own cell
 * object. Flat rather than nested-by-row so two people editing different cells
 * touch different keys and merge without conflict; a nested Y.Map per row would
 * make the row the unit of contention.
 *
 * Echo suppression uses the Yjs transaction ORIGIN rather than a boolean flag.
 * A flag breaks the moment anything is async — the flag clears before the
 * update handler runs and the bridge feeds its own change back in as a fresh
 * edit, which with two peers is an infinite ping-pong. Tagging the transaction
 * and ignoring our own origin is robust regardless of timing.
 *
 * DEGRADE, DO NOT CRASH. The Univer 0.1.x injector is semi-private and its
 * mutation ids are version-specific. Everything here is defensive: if the
 * command service or workbook cannot be reached, the bridge reports that it did
 * not attach and the editor keeps working exactly as before — unsaved, but
 * usable. A spreadsheet that will not boot is far worse than one that does not
 * yet persist, and this app has already been broken once by a plugin-resolution
 * detail (see the docs-plugin comment in Sheet.tsx).
 */
import * as Y from 'yjs'
import {
  ICommandService,
  IUniverInstanceService,
  UniverInstanceType,
} from '@univerjs/core'

/** Marks Yjs transactions the bridge itself produced, so it can ignore them. */
export const BRIDGE_ORIGIN = 'univer-bridge'

/** Univer mutation ids that change cell values in 0.1.x. */
const CELL_MUTATIONS = new Set([
  'sheet.mutation.set-range-values',
  'sheet.mutation.remove-row',
  'sheet.mutation.remove-col',
  'sheet.mutation.insert-row',
  'sheet.mutation.insert-col',
])

export interface BridgeHandle {
  attached: boolean
  reason?: string
  dispose: () => void
  /**
   * Resolved Univer services (commandService + workbook), available when
   * attached is true.  Used by sort-filter.ts to operate on cell data.
   */
  services: { commandService: any; workbook: any } | null
}

type AnyRecord = Record<string, any>

export const cellsMap = (doc: Y.Doc) => doc.getMap<AnyRecord>('cells')
export const cellKey = (sheetId: string, row: number, col: number) => `${sheetId}!${row}:${col}`

export function parseCellKey(key: string): { sheetId: string; row: number; col: number } | null {
  const bang = key.lastIndexOf('!')
  if (bang < 0) return null
  const [row, col] = key.slice(bang + 1).split(':')
  const r = Number(row)
  const c = Number(col)
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null
  return { sheetId: key.slice(0, bang), row: r, col: c }
}

/** Flatten a Univer `cellData` block into the flat keyed form. */
export function flattenCellData(sheetId: string, cellData: AnyRecord): Map<string, AnyRecord> {
  const out = new Map<string, AnyRecord>()
  for (const [rowKey, cols] of Object.entries(cellData || {})) {
    for (const [colKey, cell] of Object.entries((cols as AnyRecord) || {})) {
      if (cell === null || cell === undefined) continue
      out.set(cellKey(sheetId, Number(rowKey), Number(colKey)), cell as AnyRecord)
    }
  }
  return out
}

/** Rebuild a Univer `cellData` block for one sheet from the flat Yjs map. */
export function toCellData(doc: Y.Doc, sheetId: string): AnyRecord {
  const out: AnyRecord = {}
  for (const [key, value] of cellsMap(doc).entries()) {
    const parsed = parseCellKey(key)
    if (!parsed || parsed.sheetId !== sheetId) continue
    out[parsed.row] = out[parsed.row] || {}
    out[parsed.row][parsed.col] = value
  }
  return out
}

/** Seed the Yjs doc from a workbook snapshot, without clobbering existing data. */
export function seedFromSnapshot(doc: Y.Doc, sheetId: string, cellData: AnyRecord): void {
  const cells = cellsMap(doc)
  if (cells.size > 0) return // a loaded document wins over the starter sheet
  doc.transact(() => {
    for (const [key, cell] of flattenCellData(sheetId, cellData)) cells.set(key, cell)
  }, BRIDGE_ORIGIN)
}

interface AttachOptions {
  doc: Y.Doc
  univer: unknown
  sheetId: string
  /** Injected for testing; defaults to reading Univer's private injector. */
  resolve?: (univer: unknown) => { commandService: any; workbook: any } | null
  log?: (msg: string, err?: unknown) => void
}

function defaultResolve(univer: any): { commandService: any; workbook: any } | null {
  // `__getInjector` is not public API in Univer 0.1.x, which is exactly why the
  // caller must tolerate this returning null.
  const injector = typeof univer?.__getInjector === 'function' ? univer.__getInjector() : null
  if (!injector) return null

  // Resolve with the IMPORTED redi identifiers, not string literals.
  //
  // This previously did `injector.get('ICommandService')`, justified in a comment
  // as surviving a renamed export. That reasoning was wrong: Univer's DI is redi,
  // where `ICommandService` is an IdentifierDecorator object, not a name. redi
  // looks identifiers up by object identity, so a string NEVER resolves — the
  // lookup returned undefined, defaultResolve returned null, and every session
  // ran with `attached: false`. That is the
  //   "Edits are not being saved — the spreadsheet bridge failed to start"
  // banner, and it meant no cell edit ever reached Yjs.
  const commandService = injector.get?.(ICommandService)

  // getCurrentUniverSheetInstance() was REMOVED after 0.1.13. package.json floats
  // ^0.1.13 and 0.1.17 is installed, where the accessor is
  // getCurrentUnitForType(UniverInstanceType.UNIVER_SHEET). Both are attempted so
  // the bridge works across the floating range rather than silently detaching the
  // next time the minor moves.
  const univerInstanceService = injector.get?.(IUniverInstanceService)
  const workbook =
    univerInstanceService?.getCurrentUnitForType?.(UniverInstanceType.UNIVER_SHEET) ??
    univerInstanceService?.getCurrentUniverSheetInstance?.()

  if (!commandService || !workbook) return null
  return { commandService, workbook }
}

/**
 * Wire Univer <-> Yjs. Returns a handle saying whether it attached; callers
 * should surface `attached: false` rather than assuming persistence works.
 */
export function attachBridge(options: AttachOptions): BridgeHandle {
  const { doc, univer, sheetId, resolve = defaultResolve, log = console.warn } = options

  let resolved: { commandService: any; workbook: any } | null = null
  try {
    resolved = resolve(univer)
  } catch (err) {
    log('[sheets] bridge could not resolve Univer services', err)
    return { attached: false, reason: 'resolve threw', dispose: () => {}, services: null }
  }

  if (!resolved) {
    log('[sheets] bridge did not attach — Univer services unavailable; edits will NOT persist')
    return { attached: false, reason: 'services unavailable', dispose: () => {}, services: null }
  }

  const { commandService, workbook } = resolved
  const cells = cellsMap(doc)
  const disposers: Array<() => void> = []

  /** Univer -> Yjs. Read the sheet back after each cell mutation. */
  const onCommand = (command: AnyRecord) => {
    if (!command?.id || !CELL_MUTATIONS.has(command.id)) return
    try {
      // Prefer the command's own subUnitId (the sheet that was mutated), then
      // the active sheet's id, then fall back to the provided default sheetId.
      // Using the active sheet covers all mutations: Univer fires the command
      // on whatever sheet was active at the time, so reading the active sheet
      // immediately after the command gives the correct post-mutation state.
      const commandSheetId: string =
        command.params?.subUnitId ??
        workbook.getActiveSheet?.()?.getConfig?.()?.id ??
        workbook.getActiveSheet?.()?.getSheetId?.() ??
        sheetId

      const sheet =
        workbook.getSheetBySheetId?.(commandSheetId) ??
        workbook.getActiveSheet?.()

      const snapshot = sheet?.getConfig?.() ?? sheet?.getSnapshot?.()
      const flat = flattenCellData(commandSheetId, snapshot?.cellData ?? {})

      doc.transact(() => {
        for (const [key, cell] of flat) {
          const existing = cells.get(key)
          // Compare serialised, not by reference — Univer hands back new
          // objects each read, so identity comparison would rewrite every cell
          // on every keystroke and make the whole sheet a conflict.
          if (JSON.stringify(existing) !== JSON.stringify(cell)) cells.set(key, cell)
        }
        for (const key of [...cells.keys()]) {
          const parsed = parseCellKey(key)
          if (parsed?.sheetId === commandSheetId && !flat.has(key)) cells.delete(key)
        }
      }, BRIDGE_ORIGIN)
    } catch (err) {
      log('[sheets] failed to mirror a Univer change into Yjs', err)
    }
  }

  try {
    const sub = commandService.onCommandExecuted?.(onCommand)
    if (sub?.dispose) disposers.push(() => sub.dispose())
    else if (typeof sub === 'function') disposers.push(sub)
  } catch (err) {
    log('[sheets] could not subscribe to Univer commands', err)
    return { attached: false, reason: 'subscribe failed', dispose: () => {}, services: null }
  }

  /** Yjs -> Univer. Applies remote edits and anything a load restored. */
  const onYUpdate = (_update: Uint8Array, origin: unknown) => {
    if (origin === BRIDGE_ORIGIN) return // our own write; do not echo it back
    try {
      // Discover every sheet that has data in the Yjs doc and apply each one.
      // Hardcoding sheetId here was the original bug: a second sheet's edits
      // were never sent to Univer because toCellData only filtered for the
      // one hardcoded sheet ID.
      const sheetIds = new Set<string>()
      for (const key of cells.keys()) {
        const parsed = parseCellKey(key)
        if (parsed) sheetIds.add(parsed.sheetId)
      }
      // Always include the default sheetId so a brand-new document (no Yjs
      // data yet) still gets its starter cells applied on load.
      sheetIds.add(sheetId)

      const unitId = workbook.getUnitId?.() ?? sheetId
      for (const sid of sheetIds) {
        const cellData = toCellData(doc, sid)
        commandService.syncExecuteCommand?.('sheet.mutation.set-range-values', {
          unitId,
          subUnitId: sid,
          cellValue: cellData,
        })
      }
    } catch (err) {
      log('[sheets] failed to apply a Yjs change to Univer', err)
    }
  }

  doc.on('update', onYUpdate)
  disposers.push(() => doc.off('update', onYUpdate))

  return {
    attached: true,
    services: resolved,
    dispose: () => {
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* disposal must not throw during unmount */
        }
      }
    },
  }
}
