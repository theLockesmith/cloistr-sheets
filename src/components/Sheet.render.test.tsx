// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * Why this exists.
 *
 * Sheet starts the spreadsheet engine only after the saved sheet has LOADED
 * (`if (!editorReady) return` in the Univer init effect). Starting it earlier
 * seeds starter cells into the shared document before the real content
 * arrives, and a sheet that failed to load would show a blank grid that can be
 * edited and saved over the real one. Review found that deleting that guard
 * left every test passing: nothing rendered the component. This does.
 *
 * The engine is mocked; its constructor is a spy, so "not started" is a direct
 * assertion. The 'loaded' case proves the spy is live, so the negative
 * assertions in the other cases mean something.
 */

// vi.mock factories are hoisted above every import, so anything they share
// with the tests must be hoisted too.
const h = vi.hoisted(() => {
  // A stub that absorbs any property access, call or construction.
  const deepStub = (): any =>
    new Proxy(function () {}, {
      get: (_t, prop) => (prop === 'then' ? undefined : deepStub()),
      apply: () => deepStub(),
      construct: () => deepStub(),
    })
  return {
    deepStub,
    univerCtor: vi.fn(),
    persistence: { state: {} as Record<string, unknown> },
    controls: {
      save: vi.fn(), load: vi.fn(() => Promise.resolve({ found: false })),
      exists: vi.fn(), enableAutoSave: vi.fn(), disableAutoSave: vi.fn(),
    },
  }
})

vi.mock('@univerjs/core', () => ({
  Univer: vi.fn(function (this: any, ...args: unknown[]) {
    h.univerCtor(...args)
    this.registerPlugin = vi.fn()
    this.createUnit = vi.fn()
    this.dispose = vi.fn()
  }),
  LocaleType: { EN_US: 'enUS' },
  Tools: { deepMerge: (...parts: object[]) => Object.assign({}, ...parts) },
  UniverInstanceType: { UNIVER_SHEET: 2 },
}))
vi.mock('@univerjs/core/facade', () => ({ FUniver: { newAPI: vi.fn(() => ({})) } }))
vi.mock('@univerjs/design/locale/en-US', () => ({ default: {} }))
vi.mock('@univerjs/ui/locale/en-US', () => ({ default: {} }))
vi.mock('@univerjs/sheets/locale/en-US', () => ({ default: {} }))
vi.mock('@univerjs/sheets-ui/locale/en-US', () => ({ default: {} }))
vi.mock('@univerjs/docs-ui/locale/en-US', () => ({ default: {} }))
vi.mock('@univerjs/sheets-formula/locale/en-US', () => ({ default: {} }))
vi.mock('@univerjs/sheets-formula-ui/locale/en-US', () => ({ default: {} }))
vi.mock('@univerjs/themes', () => ({ defaultTheme: {} }))
vi.mock('@univerjs/engine-render', () => ({ UniverRenderEnginePlugin: class {} }))
vi.mock('@univerjs/engine-formula', () => ({ UniverFormulaEnginePlugin: class {} }))
vi.mock('@univerjs/docs', () => ({ UniverDocsPlugin: class {} }))
vi.mock('@univerjs/docs-ui', () => ({ UniverDocsUIPlugin: class {} }))
vi.mock('@univerjs/sheets', () => ({ UniverSheetsPlugin: class {} }))
vi.mock('@univerjs/sheets-formula', () => ({ UniverSheetsFormulaPlugin: class {} }))
vi.mock('@univerjs/sheets-formula-ui', () => ({ UniverSheetsFormulaUIPlugin: class {} }))
vi.mock('@univerjs/sheets-ui', () => ({ UniverSheetsUIPlugin: class {} }))
vi.mock('@univerjs/ui', () => ({ UniverUIPlugin: class {} }))
vi.mock('@univerjs/sheets/facade', () => ({}))
vi.mock('@univerjs/sheets-ui/facade', () => ({}))
vi.mock('@univerjs/sheets-formula/facade', () => ({}))
vi.mock('@univerjs/ui/facade', () => ({}))
vi.mock('@univerjs/engine-formula/facade', () => ({}))
vi.mock('@univerjs/design/lib/index.css', () => ({}))
vi.mock('@univerjs/ui/lib/index.css', () => ({}))
vi.mock('@univerjs/sheets-ui/lib/index.css', () => ({}))
vi.mock('@univerjs/sheets-formula-ui/lib/index.css', () => ({}))

vi.mock('@cloistr/ui/components', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
  AppShell: () => null,
  SignerRecovery: () => null,
}))

vi.mock('../lib/univer-yjs-bridge.js', () => ({
  attachBridge: vi.fn(() => ({ attached: true, services: null, dispose: vi.fn() })),
  initialSheetCells: vi.fn(() => ({})),
}))

vi.mock('@cloistr/collab-common', () => ({
  useDocumentPersistence: () => [h.persistence.state, h.controls],
  NostrSyncProvider: class { constructor() { return h.deepStub() } },
}))

import { Sheet } from './Sheet.js'

function stateWith(loadStatus: 'loading' | 'loaded' | 'failed', loadError: Error | null = null) {
  return {
    initialized: true, loading: loadStatus === 'loading', loadStatus, loadError,
    saving: false, dirty: false, lastSave: null, error: loadError,
  }
}

function renderSheet() {
  return render(<Sheet documentId="sheet-render-test" signer={h.deepStub()} publicKey="pk-test" relayUrl="wss://relay.test" />)
}

beforeEach(() => h.univerCtor.mockClear())
afterEach(() => cleanup())

describe('Sheet before the saved sheet has loaded', () => {
  it('does not start the spreadsheet engine, shows loading, and disables Save', () => {
    h.persistence.state = stateWith('loading')
    renderSheet()
    expect(h.univerCtor).not.toHaveBeenCalled()
    expect(screen.getByText('Loading sheet…')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save sheet' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('on a failed load shows the error, never starts the engine, and disables Save', () => {
    h.persistence.state = stateWith('failed', new Error('Relay query timed out'))
    renderSheet()
    expect(h.univerCtor).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/could not be opened/i)
    expect((screen.getByRole('button', { name: 'Save sheet' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Sheet once the saved sheet has loaded', () => {
  it('starts the spreadsheet engine exactly once (proves the spy is live)', () => {
    h.persistence.state = stateWith('loaded')
    renderSheet()
    expect(h.univerCtor).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Loading sheet…')).toBeNull()
  })
})
