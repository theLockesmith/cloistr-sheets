/**
 * What the sheet shows, whether a save may be attempted, and when the
 * spreadsheet engine may start, decided from the persistence hook's state in
 * ONE place. Every save path (status-bar button, File menu, Ctrl+S, signer
 * retry) goes through `saveBlockedReason`.
 *
 * collab-common 0.7.1 already refuses a save before load; this exists so the
 * app never offers one, never starts the engine (which seeds starter cells into
 * the shared document) before the saved sheet has loaded, and shows a sheet
 * that failed to open as an error rather than as a blank grid.
 */

/** The fields of useDocumentPersistence's state this module reads. */
export interface GateState {
  loadStatus: 'idle' | 'loading' | 'loaded' | 'failed'
  loadError: Error | null
  saving: boolean
  /** Holds load failures too (collab-common copies them), see saveFailure. */
  error: Error | null
}

export type DocumentView = 'loading' | 'ready' | 'failed'

export function documentView(s: GateState): DocumentView {
  if (s.loadStatus === 'loaded') return 'ready'
  if (s.loadStatus === 'failed') return 'failed'
  return 'loading'
}

/**
 * The spreadsheet engine starts, and the starter cells are seeded, only once
 * the saved sheet has loaded. Starting earlier writes A1:B2 into the shared
 * document before the real content arrives.
 */
export function shouldStartEditor(s: GateState): boolean {
  return s.loadStatus === 'loaded'
}

/** Why a save cannot run right now, or null when it can. */
export function saveBlockedReason(s: GateState): string | null {
  switch (s.loadStatus) {
    case 'idle':
    case 'loading':
      return 'The sheet is still loading, so nothing was saved yet.'
    case 'failed':
      return 'This sheet could not be opened, so it cannot be saved. Retry loading it first.'
  }
  if (s.saving) return 'Already saving.'
  return null
}

export function canSave(s: GateState): boolean {
  return saveBlockedReason(s) === null
}

/**
 * A save error worth showing as "could not save". Only meaningful once the
 * sheet has loaded: before that, `error` may be the load failure, which the
 * load-failed view already shows.
 */
export function saveFailure(s: GateState): Error | null {
  return s.loadStatus === 'loaded' ? s.error : null
}
