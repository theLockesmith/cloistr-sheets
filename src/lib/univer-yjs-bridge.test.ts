import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import {
  BRIDGE_ORIGIN,
  attachBridge,
  cellKey,
  cellsMap,
  flattenCellData,
  parseCellKey,
  seedFromSnapshot,
  toCellData,
} from './univer-yjs-bridge.js'

const SHEET = 'sheet-1'

/** Stand-in for the bits of Univer the bridge actually touches. */
function fakeUniver(cellData: Record<string, any> = {}) {
  const handlers: Array<(c: any) => void> = []
  const executed: Array<{ id: string; params: any }> = []
  const sheet = { getConfig: () => ({ cellData }) }

  const commandService = {
    onCommandExecuted: (fn: (c: any) => void) => {
      handlers.push(fn)
      return { dispose: () => handlers.splice(handlers.indexOf(fn), 1) }
    },
    syncExecuteCommand: (id: string, params: any) => {
      executed.push({ id, params })
    },
  }

  const workbook = {
    getActiveSheet: () => sheet,
    getSheetBySheetId: () => sheet,
    getUnitId: () => 'unit-1',
  }

  return {
    resolve: () => ({ commandService, workbook }),
    fire: (id: string) => handlers.forEach((h) => h({ id })),
    setCellData: (next: Record<string, any>) => {
      for (const k of Object.keys(cellData)) delete cellData[k]
      Object.assign(cellData, next)
    },
    executed,
    handlerCount: () => handlers.length,
  }
}

describe('cell keys', () => {
  it('round-trips', () => {
    expect(parseCellKey(cellKey(SHEET, 3, 7))).toEqual({ sheetId: SHEET, row: 3, col: 7 })
  })

  it('survives a sheet id containing a separator character', () => {
    // lastIndexOf('!') rather than split('!') — a sheet named "a!b" must not
    // silently parse to the wrong sheet.
    expect(parseCellKey('a!b!2:5')).toEqual({ sheetId: 'a!b', row: 2, col: 5 })
  })

  it('rejects malformed keys instead of producing NaN coordinates', () => {
    expect(parseCellKey('no-separator')).toBeNull()
    expect(parseCellKey('sheet!x:y')).toBeNull()
  })
})

describe('flatten / rebuild', () => {
  const cellData = {
    0: { 0: { v: 'Hello' }, 1: { v: 'World' } },
    2: { 5: { v: 42 } },
  }

  it('flattens only populated cells', () => {
    const flat = flattenCellData(SHEET, cellData)
    expect(flat.size).toBe(3)
    expect(flat.get(cellKey(SHEET, 2, 5))).toEqual({ v: 42 })
  })

  it('round-trips through the Yjs doc', () => {
    const doc = new Y.Doc()
    seedFromSnapshot(doc, SHEET, cellData)
    expect(toCellData(doc, SHEET)).toEqual(cellData)
  })

  it('ignores cells belonging to another sheet', () => {
    const doc = new Y.Doc()
    seedFromSnapshot(doc, SHEET, cellData)
    cellsMap(doc).set(cellKey('other', 0, 0), { v: 'nope' })
    expect(toCellData(doc, SHEET)).toEqual(cellData)
  })
})

describe('seedFromSnapshot', () => {
  it('does NOT overwrite a document that already has content', () => {
    // The failure this prevents: a real sheet is restored from Blossom, then
    // the starter "Hello / World" sample overwrites the user's data.
    const doc = new Y.Doc()
    cellsMap(doc).set(cellKey(SHEET, 0, 0), { v: 'real user data' })

    seedFromSnapshot(doc, SHEET, { 0: { 0: { v: 'Hello' }, 1: { v: 'World' } } })

    expect(cellsMap(doc).get(cellKey(SHEET, 0, 0))).toEqual({ v: 'real user data' })
    expect(cellsMap(doc).size).toBe(1)
  })

  it('seeds an empty document', () => {
    const doc = new Y.Doc()
    seedFromSnapshot(doc, SHEET, { 0: { 0: { v: 'Hello' } } })
    expect(cellsMap(doc).size).toBe(1)
  })
})

describe('attachBridge', () => {
  it('degrades instead of throwing when Univer services are unavailable', () => {
    // The editor must keep working even if the private injector moves. Not
    // persisting is bad; failing to boot is much worse.
    const doc = new Y.Doc()
    const log = vi.fn()
    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: () => null, log })

    expect(handle.attached).toBe(false)
    expect(handle.reason).toBeTruthy()
    expect(log).toHaveBeenCalled()
    expect(() => handle.dispose()).not.toThrow()
  })

  it('degrades when resolving throws', () => {
    const doc = new Y.Doc()
    const handle = attachBridge({
      doc,
      univer: {},
      sheetId: SHEET,
      resolve: () => {
        throw new Error('injector gone')
      },
      log: vi.fn(),
    })
    expect(handle.attached).toBe(false)
  })

  it('mirrors a Univer cell mutation into Yjs — the whole point', () => {
    const doc = new Y.Doc()
    const u = fakeUniver({ 0: { 0: { v: 'typed' } } })
    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: u.resolve })
    expect(handle.attached).toBe(true)

    u.fire('sheet.mutation.set-range-values')

    expect(cellsMap(doc).get(cellKey(SHEET, 0, 0))).toEqual({ v: 'typed' })
    handle.dispose()
  })

  it('marks the Yjs doc dirty, which is what enables Save', () => {
    // useDocumentPersistence sets dirty from ydoc.on('update'). If the bridge
    // does not produce an update, the Save button stays disabled forever —
    // exactly the reported symptom.
    const doc = new Y.Doc()
    const u = fakeUniver({ 0: { 0: { v: 'x' } } })
    const updates: unknown[] = []
    doc.on('update', () => updates.push(1))

    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: u.resolve })
    u.fire('sheet.mutation.set-range-values')

    expect(updates.length).toBeGreaterThan(0)
    handle.dispose()
  })

  it('removes cells the user cleared', () => {
    const doc = new Y.Doc()
    const u = fakeUniver({ 0: { 0: { v: 'gone soon' } } })
    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: u.resolve })

    u.fire('sheet.mutation.set-range-values')
    expect(cellsMap(doc).size).toBe(1)

    u.setCellData({})
    u.fire('sheet.mutation.set-range-values')
    expect(cellsMap(doc).size).toBe(0)

    handle.dispose()
  })

  it('does not echo its own writes back into Univer', () => {
    // Without origin tagging this ping-pongs forever between two peers.
    const doc = new Y.Doc()
    const u = fakeUniver({ 0: { 0: { v: 'a' } } })
    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: u.resolve })

    u.fire('sheet.mutation.set-range-values')

    expect(u.executed.length).toBe(0)
    handle.dispose()
  })

  it('applies a REMOTE Yjs change to Univer', () => {
    const doc = new Y.Doc()
    const u = fakeUniver({})
    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: u.resolve })

    // A peer's edit arrives with a different origin.
    doc.transact(() => {
      cellsMap(doc).set(cellKey(SHEET, 1, 1), { v: 'from a peer' })
    }, 'remote-peer')

    expect(u.executed.length).toBe(1)
    expect(u.executed[0]?.params.cellValue).toEqual({ 1: { 1: { v: 'from a peer' } } })
    handle.dispose()
  })

  it('ignores mutations that do not change cells', () => {
    const doc = new Y.Doc()
    const u = fakeUniver({ 0: { 0: { v: 'x' } } })
    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: u.resolve })

    u.fire('sheet.command.some-selection-change')

    expect(cellsMap(doc).size).toBe(0)
    handle.dispose()
  })

  it('unsubscribes on dispose', () => {
    const doc = new Y.Doc()
    const u = fakeUniver({ 0: { 0: { v: 'x' } } })
    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: u.resolve })
    expect(u.handlerCount()).toBe(1)

    handle.dispose()
    expect(u.handlerCount()).toBe(0)

    // And a later mutation must not still write through.
    u.fire('sheet.mutation.set-range-values')
    expect(cellsMap(doc).size).toBe(0)
  })

  it('tags its own transactions so persistence can tell them apart', () => {
    const doc = new Y.Doc()
    const u = fakeUniver({ 0: { 0: { v: 'x' } } })
    const origins: unknown[] = []
    doc.on('update', (_u: Uint8Array, origin: unknown) => origins.push(origin))

    const handle = attachBridge({ doc, univer: {}, sheetId: SHEET, resolve: u.resolve })
    u.fire('sheet.mutation.set-range-values')

    expect(origins).toContain(BRIDGE_ORIGIN)
    handle.dispose()
  })
})

// ---------------------------------------------------------------------------
// Regression: the bridge must resolve Univer services through redi IDENTIFIERS
// ---------------------------------------------------------------------------
//
// Shipped broken. defaultResolve() called injector.get('ICommandService') with a
// STRING, justified in a comment as surviving a renamed export. Univer's DI is
// redi, where ICommandService is an IdentifierDecorator object looked up by
// identity — a string never matches. So resolve returned null on every load and
// the app permanently displayed
//   "Edits are not being saved — the spreadsheet bridge failed to start"
// while no cell edit ever reached Yjs.
//
// The second half was independent: getCurrentUniverSheetInstance() was removed
// after 0.1.13, and package.json floats ^0.1.13 with 0.1.17 installed.
//
// These tests model an injector the way redi actually behaves — identity-keyed,
// undefined for anything else — so a regression to string lookups fails here
// rather than in production behind a banner.
describe('defaultResolve via a redi-like injector', () => {
  const ICommandServiceId = { toString: () => 'ICommandService' }
  const IUniverInstanceServiceId = { toString: () => 'IUniverInstanceService' }

  function makeUniver(opts: { legacyAccessor?: boolean } = {}) {
    const commandService = { onCommandExecuted: () => () => {} }
    const workbook = { getSheetId: () => SHEET }
    const instanceService = opts.legacyAccessor
      ? { getCurrentUniverSheetInstance: () => workbook }
      : { getCurrentUnitForType: (t: unknown) => (t === 2 ? workbook : null) }

    return {
      __getInjector: () => ({
        // Identity comparison, exactly like redi: a string key resolves to
        // undefined, which is what made the old code fail silently.
        get: (id: unknown) => {
          if (id === ICommandServiceId) return commandService
          if (id === IUniverInstanceServiceId) return instanceService
          return undefined
        },
      }),
    }
  }

  it('a string-keyed lookup resolves nothing — the original bug', () => {
    const injector = makeUniver().__getInjector()
    expect(injector.get('ICommandService')).toBeUndefined()
    expect(injector.get('IUniverInstanceService')).toBeUndefined()
  })

  it('attaches against the 0.1.17 accessor (getCurrentUnitForType)', () => {
    const doc = new Y.Doc()
    const univer = makeUniver()
    const handle = attachBridge({
      doc,
      univer,
      sheetId: SHEET,
      resolve: (u: any) => {
        const inj = (u as any).__getInjector()
        const commandService = inj.get(ICommandServiceId)
        const svc = inj.get(IUniverInstanceServiceId)
        const workbook = svc?.getCurrentUnitForType?.(2) ?? svc?.getCurrentUniverSheetInstance?.()
        return commandService && workbook ? { commandService, workbook } : null
      },
      log: vi.fn(),
    })
    expect(handle.attached).toBe(true)
    handle.dispose()
  })

  it('still attaches against the pre-0.1.14 accessor', () => {
    const doc = new Y.Doc()
    const univer = makeUniver({ legacyAccessor: true })
    const handle = attachBridge({
      doc,
      univer,
      sheetId: SHEET,
      resolve: (u: any) => {
        const inj = (u as any).__getInjector()
        const commandService = inj.get(ICommandServiceId)
        const svc = inj.get(IUniverInstanceServiceId)
        const workbook = svc?.getCurrentUnitForType?.(2) ?? svc?.getCurrentUniverSheetInstance?.()
        return commandService && workbook ? { commandService, workbook } : null
      },
      log: vi.fn(),
    })
    expect(handle.attached).toBe(true)
    handle.dispose()
  })
})
