import { describe, it, expect } from 'vitest'
import { documentView, canSave, saveBlockedReason, saveFailure, shouldStartEditor, type GateState } from './persistenceGate.js'

/**
 * Why this exists.
 *
 * collab-common 0.7.1 refuses to save until the sheet has loaded, and reports a
 * load that failed (including a relay that connects but never answers) as
 * loadStatus 'failed' instead of pretending it found a new, empty sheet.
 *
 * Sheets had a sharper version of the problem than the other apps: it started
 * the spreadsheet engine on mount and seeded four starter cells (A1:B2) into
 * the shared document BEFORE the saved sheet had loaded. The load then merged
 * into a document that already had those keys, and the collaboration provider
 * broadcast the starter cells to everyone else in the sheet.
 */

function state(over: Partial<GateState> = {}): GateState {
  return { loadStatus: 'idle', loadError: null, saving: false, error: null, ...over }
}

describe('documentView', () => {
  it('shows loading until the load settles', () => {
    expect(documentView(state({ loadStatus: 'idle' }))).toBe('loading')
    expect(documentView(state({ loadStatus: 'loading' }))).toBe('loading')
  })

  it('shows the sheet only once loaded', () => {
    expect(documentView(state({ loadStatus: 'loaded' }))).toBe('ready')
  })

  it('shows an error, never a blank sheet, when the load failed', () => {
    expect(documentView(state({ loadStatus: 'failed', loadError: new Error('timed out') }))).toBe('failed')
  })
})

describe('shouldStartEditor', () => {
  it('starts the spreadsheet engine (and seeds starter cells) only after a confirmed load', () => {
    expect(shouldStartEditor(state({ loadStatus: 'loaded' }))).toBe(true)
    for (const loadStatus of ['idle', 'loading', 'failed'] as const) {
      expect(shouldStartEditor(state({ loadStatus }))).toBe(false)
    }
  })
})

describe('save gate', () => {
  it('refuses to save before the sheet has loaded', () => {
    for (const loadStatus of ['idle', 'loading'] as const) {
      expect(canSave(state({ loadStatus }))).toBe(false)
      expect(saveBlockedReason(state({ loadStatus }))).toMatch(/still loading/i)
    }
  })

  it('refuses to save a sheet that failed to load', () => {
    const s = state({ loadStatus: 'failed', loadError: new Error('timed out') })
    expect(canSave(s)).toBe(false)
    expect(saveBlockedReason(s)).toMatch(/could not be opened/i)
  })

  it('refuses a second save while one is in flight', () => {
    const s = state({ loadStatus: 'loaded', saving: true })
    expect(canSave(s)).toBe(false)
    expect(saveBlockedReason(s)).toMatch(/already saving/i)
  })

  it('allows a save once loaded', () => {
    const s = state({ loadStatus: 'loaded' })
    expect(canSave(s)).toBe(true)
    expect(saveBlockedReason(s)).toBeNull()
  })
})

describe('saveFailure', () => {
  it('reports a save error once the sheet is loaded', () => {
    const err = new Error('blossom down')
    expect(saveFailure(state({ loadStatus: 'loaded', error: err }))).toBe(err)
  })

  it('does not report a load failure as a save failure', () => {
    const err = new Error('timed out')
    expect(saveFailure(state({ loadStatus: 'failed', loadError: err, error: err }))).toBeNull()
  })
})
