import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from '@cloistr/ui/components'
import { AppShell } from '@cloistr/ui/components'
import type { MenuSection, MenuEntry } from '@cloistr/ui/components'
import { Univer, LocaleType, Tools, UniverInstanceType } from '@univerjs/core'
// Locale imports use the packages' exports map (`./locale/*`) so TypeScript
// resolves the .d.ts declarations in lib/types/locale/. The old `./lib/locale/*.json`
// path was valid in 0.1.x but 0.25.x ships .js locale files with no adjacent .d.ts.
import DesignEnUS from '@univerjs/design/locale/en-US'
import UIEnUS from '@univerjs/ui/locale/en-US'
import SheetsEnUS from '@univerjs/sheets/locale/en-US'
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US'
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US'
import SheetsFormulaEnUS from '@univerjs/sheets-formula/locale/en-US'
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US'
// defaultTheme moved from @univerjs/design to @univerjs/themes in 0.25.x
import { defaultTheme } from '@univerjs/themes'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverUIPlugin } from '@univerjs/ui'
// Facade API. `FUniver` is the public, stable surface over Univer's internal
// dependency injection; each `*/facade` import is a side-effect module that
// registers that plugin's methods onto it. All of these ship inside the
// packages already installed, so this adds no dependency.
import { FUniver } from '@univerjs/core/facade'
import '@univerjs/sheets/facade'
import '@univerjs/sheets-ui/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/ui/facade'
import '@univerjs/engine-formula/facade'
import * as Y from 'yjs'
import { NostrSyncProvider, useDocumentPersistence } from '@cloistr/collab-common'
import type { SignerInterface } from '@cloistr/auth'
import { SignerRecovery } from '@cloistr/ui/components'
import { attachBridge, seedFromSnapshot, type BridgeHandle } from '../lib/univer-yjs-bridge.js'
import { withSignerRetry } from '../lib/signerRetry.js'
import { SortFilterPanel } from './SortFilterPanel.js'
import { ChartPanel } from './ChartPanel.js'
import { ConditionalFormatPanel } from './ConditionalFormatPanel.js'
import { ImportExportPanel } from './ImportExportPanel.js'
import { FormulaReferencePanel } from './FormulaReferencePanel.js'
import type { SortFilterServices } from '../lib/sort-filter.js'

// For development, use VITE_BLOSSOM_URL env var or fall back to public server
// Production uses files.cloistr.xyz with platform auth
const BLOSSOM_URL = import.meta.env.VITE_BLOSSOM_URL || 'https://nostr.download'

// Import Univer styles
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'
import '@univerjs/sheets-formula-ui/lib/index.css'

interface SheetProps {
  signer: SignerInterface
  publicKey: string
  relayUrl: string
  documentId: string
}

export type ActivePanel = 'sort-filter' | 'chart' | 'conditional' | 'import-export' | null

// ─────────────────────────────────────────────────────────────────────────────
// Menu model for AppShell
//
// Returns the OUR commands (File/Edit/View/Insert/Format/Data) as MenuSection[]
// so that AppShell can render them as a horizontal bar on desktop and as drawer
// sections on mobile.  Univer's own ribbon is NOT touched.
//
// Disabled items must have NO onSelect — AppShell renders them grayed with a
// tooltip from disabledReason.  An enabled item with an empty onSelect is
// worse than absent.
// ─────────────────────────────────────────────────────────────────────────────

function buildMenuSections(p: {
  hasServices: boolean
  onUndo: () => void
  onRedo: () => void
  onImportCSV: () => void
  onExportCSV: () => void
  onExportXLSX: () => void
  onSave: () => void
  onFreezeTopRow: () => void
  onUnfreeze: () => void
  onInsertRowBefore: () => void
  onInsertColBefore: () => void
  onToggleChart: () => void
  onToggleFormulaRef: () => void
  onToggleConditional: () => void
  onToggleSortFilter: () => void
  persistenceState: { dirty: boolean; saving: boolean; initialized: boolean }
}): MenuSection[] {
  const { hasServices, persistenceState } = p
  const NEEDS_SHEET = 'Open a document first'

  // Builds one MenuEntry: enabled (with onSelect) or disabled (with reason).
  // exactOptionalPropertyTypes: string | undefined allows callers to pass an
  // expression that resolves to undefined without TypeScript complaining.
  function item(opts: {
    label: string
    action?: () => void | undefined
    enabled?: boolean | undefined
    disabledReason?: string | undefined
    shortcut?: string | undefined
  }): MenuEntry {
    const { label, action, shortcut, disabledReason } = opts
    const enabled = opts.enabled !== false && !!action
    return enabled
      ? { label, ...(shortcut ? { shortcut } : {}), onSelect: action }
      : { label, ...(shortcut ? { shortcut } : {}), ...(disabledReason ? { disabledReason } : {}) }
  }

  const sep: MenuEntry = { separator: true }

  return [
    {
      label: 'File',
      items: [
        item({ label: 'Import CSV…', action: p.onImportCSV, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        sep,
        item({ label: 'Export as CSV', action: p.onExportCSV, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        item({ label: 'Export as XLSX', action: p.onExportXLSX, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        sep,
        item({
          label: persistenceState.saving ? 'Saving…' : 'Save',
          shortcut: 'Ctrl+S',
          action: p.onSave,
          enabled: hasServices && persistenceState.initialized && !persistenceState.saving && persistenceState.dirty,
          disabledReason: !hasServices ? NEEDS_SHEET : !persistenceState.dirty ? 'No unsaved changes' : undefined,
        }),
      ],
    },
    {
      label: 'Edit',
      items: [
        item({ label: 'Undo', shortcut: 'Ctrl+Z', action: p.onUndo, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        item({ label: 'Redo', shortcut: 'Ctrl+Y', action: p.onRedo, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        sep,
        // Cut/Copy/Paste and Find are handled by Univer directly in the grid.
        // Showing them as disabled makes the shortcut discoverable without
        // adding a second, conflicting handler.
        item({ label: 'Cut', shortcut: 'Ctrl+X', disabledReason: 'Use Ctrl+X in the grid' }),
        item({ label: 'Copy', shortcut: 'Ctrl+C', disabledReason: 'Use Ctrl+C in the grid' }),
        item({ label: 'Paste', shortcut: 'Ctrl+V', disabledReason: 'Use Ctrl+V in the grid' }),
        sep,
        item({ label: 'Find & Replace', shortcut: 'Ctrl+H', disabledReason: 'Use Ctrl+H in the grid' }),
      ],
    },
    {
      label: 'View',
      items: [
        item({ label: 'Freeze top row', action: p.onFreezeTopRow, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        item({ label: 'Unfreeze panes', action: p.onUnfreeze, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        sep,
        item({ label: 'Gridlines', disabledReason: 'Coming soon' }),
        item({ label: 'Zoom', disabledReason: 'Coming soon' }),
      ],
    },
    {
      label: 'Insert',
      items: [
        item({ label: 'Row above', action: p.onInsertRowBefore, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        item({ label: 'Column left', action: p.onInsertColBefore, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        sep,
        item({ label: 'Chart…', action: p.onToggleChart, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        sep,
        item({ label: 'Function reference…', action: p.onToggleFormulaRef, enabled: hasServices, disabledReason: NEEDS_SHEET }),
      ],
    },
    {
      label: 'Format',
      items: [
        item({ label: 'Conditional formatting…', action: p.onToggleConditional, enabled: hasServices, disabledReason: NEEDS_SHEET }),
        sep,
        item({ label: 'Number format', disabledReason: 'Coming soon' }),
        item({ label: 'Cell alignment', disabledReason: 'Use the Univer toolbar' }),
      ],
    },
    {
      label: 'Data',
      items: [
        item({ label: 'Sort & Filter…', action: p.onToggleSortFilter, enabled: hasServices, disabledReason: NEEDS_SHEET }),
      ],
    },
  ]
}

export function Sheet({ documentId, signer, publicKey: _publicKey, relayUrl }: SheetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<Univer | null>(null)
  const [ydoc] = useState(() => new Y.Doc())
  // providerRef keeps a stable reference to the active NostrSyncProvider so the
  // visibilitychange reconnect (Part 4) can call provider.connect() without
  // capturing a stale closure.
  const providerRef = useRef<NostrSyncProvider | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const bridgeRef = useRef<BridgeHandle | null>(null)
  const [bridgeAttached, setBridgeAttached] = useState(true)
  const [bridgeServices, setBridgeServices] = useState<SortFilterServices | null>(null)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [showFormulaRef, setShowFormulaRef] = useState(false)

  // Wire Univer to the app's dark/light theme.  Univer's Tailwind classes use
  // the `dark:` prefix which activates when a parent element carries the `dark`
  // CSS class.  The @cloistr/ui ThemeProvider sets `data-theme` on <html> and
  // exposes `resolvedTheme` here; we pass that into the Univer container so
  // Univer's own components see the correct mode without knowing about our
  // ThemeProvider.
  const { resolvedTheme } = useTheme()

  // signerError is set when a SAVE operation fails after retries are exhausted.
  // It is cleared when the user dismisses the recovery screen or retries.
  // It never causes a logout — the session is untouched.
  const [signerError, setSignerError] = useState<unknown>(null)
  const [retryingSave, setRetryingSave] = useState(false)

  // Workaround for collab-common 0.2.14 bug: loading stuck after initialization
  const persistLoadSettledRef = useRef(false)
  const [persistLoadSettled, setPersistLoadSettled] = useState(false)

  // Initialize NostrSyncProvider
  useEffect(() => {
    const syncProvider = new NostrSyncProvider(ydoc, {
      signer,
      relayUrl,
      docId: documentId,
    })

    // Keep a stable ref so visibilitychange can reconnect without a stale closure.
    providerRef.current = syncProvider

    syncProvider.onConnect = () => {
      setIsConnected(true)
    }

    syncProvider.onDisconnect = () => {
      setIsConnected(false)
    }

    syncProvider.onPeersChange = (count: number) => {
      setPeerCount(count)
    }

    syncProvider.onError = (error: Error) => {
      console.error('[Sheet] Sync error:', error)
    }

    syncProvider.connect().catch(console.error)

    return () => {
      providerRef.current = null
      syncProvider.destroy()
    }
  }, [documentId, ydoc, signer, relayUrl])

  // Part 4: visibilitychange reconnect for the Yjs sync layer.
  //
  // When the user tabs away (phone goes to background, laptop closes) and then
  // comes back, the WebSocket to the relay is often gone. The NostrSyncProvider
  // has its own internal scheduleReconnect, but that fires on events from a
  // dead socket — when the socket is silently dropped (common on mobile) no
  // event arrives and the provider stays disconnected indefinitely.
  //
  // Calling connect() on visibility restore is the client-side complement: a
  // proactive reconnect attempt that does not wait for a socket event that will
  // never come. The provider handles duplicate connect() calls safely.
  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState !== 'visible') return
      const provider = providerRef.current
      if (provider && !provider.connected) {
        provider.connect().catch((err) => {
          console.warn('[Sheet] Visibility-triggered reconnect failed:', err)
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, []) // providerRef is a ref — stable, not a reactive dependency

  // Document persistence via Blossom
  const [persistenceState, persistenceControls] = useDocumentPersistence(
    ydoc,
    {
      documentId,
      blossomUrl: BLOSSOM_URL,
      relayUrl,
      signer,
    },
    {
      autoLoad: true,
      autoSaveInterval: 60000,
    }
  )

  // Part 3: withSignerRetry wraps the save so transient relay failures are
  // retried automatically (up to 3 attempts, exponential backoff with full
  // jitter). A user denial (CANCELLED, REMOTE_ERROR) is NOT retried — the
  // user said no and must not be re-prompted silently.
  //
  // On final failure, signerError is set. This surfaces SignerRecovery rather
  // than a logout or a silent error. The session is untouched.
  const handleSave = useCallback(async () => {
    if (retryingSave) return
    setSignerError(null)
    setRetryingSave(true)
    try {
      await withSignerRetry(
        () => persistenceControls.save(),
        {
          onRetry: (attempt, delayMs) => {
            console.info(`[Sheet] Save retry ${attempt} in ${delayMs}ms`)
          },
        },
      )
    } catch (error) {
      console.error('[Sheet] Save failed after retries:', error)
      setSignerError(error)
    } finally {
      setRetryingSave(false)
    }
  }, [persistenceControls, retryingSave])

  // Detect stuck loading state from collab-common 0.2.14 bug
  useEffect(() => {
    if (persistLoadSettledRef.current) return
    if (!persistenceState.initialized) return

    if (!persistenceState.loading) {
      persistLoadSettledRef.current = true
      setPersistLoadSettled(true)
      return
    }

    const timer = setTimeout(() => {
      if (!persistLoadSettledRef.current) {
        console.warn(
          '[Sheet] persistenceState.loading stuck after initialization -- ' +
          'likely collab-common 0.2.14 bug. Treating load as complete.'
        )
        persistLoadSettledRef.current = true
        setPersistLoadSettled(true)
      }
    }, 12000)

    return () => clearTimeout(timer)
  }, [persistenceState.initialized, persistenceState.loading])

  // Initialize Univer
  useEffect(() => {
    if (!containerRef.current) return

    const univer = new Univer({
      theme: defaultTheme,
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: Tools.deepMerge(
          {},
          SheetsEnUS,
          SheetsUIEnUS,
          SheetsFormulaEnUS,
          SheetsFormulaUIEnUS,
          DocsUIEnUS,
          UIEnUS,
          DesignEnUS,
        ),
      },
    })

    // Register plugins in dependency order.
    //
    // UniverSheetsFormulaPlugin wires the formula function library into the sheet.
    // Without it, UniverFormulaEnginePlugin is present (the calculation engine)
    // but its 528 built-in functions are never registered, so =SUM(1,2) evaluates
    // to #NAME? instead of 3. UniverSheetsFormulaUIPlugin adds the formula bar
    // and function autocomplete. Both belong BEFORE UniverSheetsUIPlugin so that
    // the UI layer can find the formula services during its own initialization.
    univer.registerPlugin(UniverRenderEnginePlugin)
    univer.registerPlugin(UniverFormulaEnginePlugin)
    univer.registerPlugin(UniverUIPlugin, {
      container: containerRef.current,
    })
    // Docs plugins must come before sheets plugins (redi resolution order):
    // sheets-ui injects doc services; registering docs after leaves a resolution gap.
    univer.registerPlugin(UniverDocsPlugin)
    univer.registerPlugin(UniverDocsUIPlugin)
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsFormulaPlugin)
    univer.registerPlugin(UniverSheetsFormulaUIPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin)

    // createUniverSheet was renamed to createUnit in Univer 0.25.x.
    // The data shape (IWorkbookData) is unchanged.
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
      id: documentId,
      name: 'Sheet1',
      sheetOrder: ['sheet-1'],
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Sheet1',
          cellData: {
            0: {
              0: { v: 'Hello' },
              1: { v: 'World' },
            },
            1: {
              0: { v: 'Welcome to' },
              1: { v: 'Cloistr Sheets' },
            },
          },
          rowCount: 1000,
          columnCount: 26,
        },
      },
    })

    univerRef.current = univer

    // Expose the facade as window.univerAPI.
    //
    // Univer's own documented pattern, and the only supported way to read a
    // cell's COMPUTED value from outside React. Without it there is no way to
    // assert that "=SUM(1,2)" produced 3 rather than #NAME?, which is exactly
    // how sheets shipped 47 advertised functions it could not evaluate.
    //
    // The office-app checklist suite depends on this: 12 [P0] checks were
    // blocked on `window.univerAPI not found` and reported green without
    // reading a single cell (audit 2026-08-24). This is a read-only accessor
    // over state the page already holds, not a new capability.
    const univerAPI = FUniver.newAPI(univer)
    ;(window as unknown as { univerAPI?: unknown }).univerAPI = univerAPI

    seedFromSnapshot(ydoc, 'sheet-1', {
      0: { 0: { v: 'Hello' }, 1: { v: 'World' } },
      1: { 0: { v: 'Welcome to' }, 1: { v: 'Cloistr Sheets' } },
    })

    const bridge = attachBridge({ doc: ydoc, univer, sheetId: 'sheet-1' })
    bridgeRef.current = bridge
    setBridgeAttached(bridge.attached)
    setBridgeServices(bridge.services)
    if (!bridge.attached) {
      console.error(
        `[sheets] Yjs bridge did not attach (${bridge.reason}) — edits will not be saved`,
      )
    }

    return () => {
      bridgeRef.current?.dispose()
      bridgeRef.current = null
      ;(window as unknown as { univerAPI?: unknown }).univerAPI = undefined
      univer?.dispose()
    }
  }, [documentId, ydoc])

  const unitId = documentId

  // ── Command helpers ─────────────────────────────────────────────────────

  function executeCommand(commandId: string, params?: Record<string, unknown>) {
    if (!bridgeServices) return
    bridgeServices.commandService.executeCommand?.(commandId, params)
  }

  function handleUndo() {
    executeCommand('univer.command.undo')
  }

  function handleRedo() {
    executeCommand('univer.command.redo')
  }

  function handleFreezeTopRow() {
    if (!bridgeServices) return
    const { commandService, workbook } = bridgeServices
    const sheet = workbook.getActiveSheet?.()
    if (!sheet) return
    commandService.executeCommand?.('sheet.command.set-frozen', {
      unitId,
      subUnitId: sheet.getSheetId?.() ?? 'sheet-1',
      startRow: 1,
      startColumn: -1,
      ySplit: 1,
      xSplit: 0,
    })
  }

  function handleUnfreeze() {
    if (!bridgeServices) return
    const { commandService, workbook } = bridgeServices
    const sheet = workbook.getActiveSheet?.()
    if (!sheet) return
    commandService.executeCommand?.('sheet.command.set-frozen-cancel', {
      unitId,
      subUnitId: sheet.getSheetId?.() ?? 'sheet-1',
    })
  }

  function handleInsertRowBefore() {
    if (!bridgeServices) return
    const { commandService, workbook } = bridgeServices
    const sheet = workbook.getActiveSheet?.()
    if (!sheet) return
    commandService.executeCommand?.('sheet.command.insert-row-before', {
      unitId,
      subUnitId: sheet.getSheetId?.() ?? 'sheet-1',
      range: { startRow: 0, endRow: 0 },
      insertType: 0,
    })
  }

  function handleInsertColBefore() {
    if (!bridgeServices) return
    const { commandService, workbook } = bridgeServices
    const sheet = workbook.getActiveSheet?.()
    if (!sheet) return
    commandService.executeCommand?.('sheet.command.insert-col-before', {
      unitId,
      subUnitId: sheet.getSheetId?.() ?? 'sheet-1',
      range: { startColumn: 0, endColumn: 0 },
      insertType: 0,
    })
  }

  // ── Panel toggle helper ─────────────────────────────────────────────────
  function togglePanel(panel: ActivePanel) {
    setActivePanel((current) => current === panel ? null : panel)
  }

  // ── Import/Export: expose imperative triggers to the menu ───────────────
  // The menu triggers import/export without the user having to open the panel
  // first. We open the panel then fire the action after a tick so the panel
  // has mounted and can receive the call.
  const importExportRef = useRef<{
    triggerImportCSV: () => void
    triggerExportCSV: () => void
    triggerExportXLSX: () => void
  } | null>(null)

  function handleImportCSV() {
    setActivePanel('import-export')
    setTimeout(() => importExportRef.current?.triggerImportCSV(), 50)
  }

  function handleExportCSV() {
    setActivePanel('import-export')
    setTimeout(() => importExportRef.current?.triggerExportCSV(), 50)
  }

  function handleExportXLSX() {
    setActivePanel('import-export')
    setTimeout(() => importExportRef.current?.triggerExportXLSX(), 50)
  }

  // ── Global keyboard shortcuts ───────────────────────────────────────────
  //
  // Previously in MenuBar.tsx. Moved here so they fire regardless of whether
  // the user is in the drawer (mobile) or the menu bar (desktop).  They still
  // guard against typing in a focused input / contenteditable so they do not
  // interfere with cell editing inside Univer.
  useEffect(() => {
    if (!bridgeServices) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if (ctrl && e.key === 'y') { e.preventDefault(); handleRedo() }
      if (ctrl && e.shiftKey && e.key === 'Z') { e.preventDefault(); handleRedo() }
      if (ctrl && e.key === 's') { e.preventDefault(); void handleSave() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // handleSave is memoised; handleUndo/handleRedo are plain functions that
  // close over bridgeServices — rebuilding the handler when bridgeServices
  // changes is correct and intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeServices, handleSave])

  // ── Menu sections for AppShell ─────────────────────────────────────────
  //
  // Computed inline so the sections always reflect the latest state without
  // needing useMemo.  AppShell re-renders with Sheet on any state change, so
  // the sections are always fresh when passed down.
  //
  // Commands checked: every onSelect here has a corresponding handler above.
  // Cut/Copy/Paste and Find are intentionally absent (disabled, Univer handles
  // them directly in the grid).  The toolbar is Univer's own chrome; we do not
  // hide it here because it is not ours to own.
  const menuSections = buildMenuSections({
    hasServices: !!bridgeServices,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onImportCSV: handleImportCSV,
    onExportCSV: handleExportCSV,
    onExportXLSX: handleExportXLSX,
    onSave: handleSave,
    onFreezeTopRow: handleFreezeTopRow,
    onUnfreeze: handleUnfreeze,
    onInsertRowBefore: handleInsertRowBefore,
    onInsertColBefore: handleInsertColBefore,
    onToggleChart: () => togglePanel('chart'),
    onToggleFormulaRef: () => setShowFormulaRef(true),
    onToggleConditional: () => togglePanel('conditional'),
    onToggleSortFilter: () => togglePanel('sort-filter'),
    persistenceState,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Menu bar / mobile hamburger ────────────────────────────────── */}
      {/*
        AppShell owns the single mobile affordance for OUR commands.
        - Desktop (>=768px): renders the horizontal File/Edit/… bar.
        - Mobile (<768px): renders the hamburger; drawer opens with those
          same sections as collapsible groups.
        Univer's own ribbon (Start | Formulas | Data) sits below this and is
        NOT part of our menu model — we extend Univer's chrome, not replace it.
      */}
      <AppShell serviceId="sheets" menu={menuSections} />

      {/* ── Feature panels (one open at a time) ──────────────────────── */}
      {bridgeServices && activePanel === 'sort-filter' && (
        <div id="sort-filter-panel" style={{ flexShrink: 0 }}>
          <SortFilterPanel
            services={bridgeServices}
            sheetId="sheet-1"
            unitId={unitId}
          />
          <div style={{
            padding: '0 0.75rem 0.25rem',
            backgroundColor: 'var(--cloistr-bg)',
            borderBottom: '1px solid var(--cloistr-border)',
            fontSize: '0.75rem',
            color: 'var(--cloistr-text-muted)',
          }}>
            Sort is collaborative (synced via Yjs). Filter is local (your view only).
          </div>
        </div>
      )}

      {bridgeServices && activePanel === 'chart' && (
        <div id="chart-panel" style={{ flexShrink: 0 }}>
          <ChartPanel
            workbook={bridgeServices.workbook}
            unitId={unitId}
            sheetId="sheet-1"
          />
        </div>
      )}

      {bridgeServices && activePanel === 'conditional' && (
        <div id="conditional-panel" style={{ flexShrink: 0 }}>
          <ConditionalFormatPanel
            services={bridgeServices}
            unitId={unitId}
            sheetId="sheet-1"
          />
        </div>
      )}

      {bridgeServices && activePanel === 'import-export' && (
        <div id="import-export-panel" style={{ flexShrink: 0 }}>
          <ImportExportPanel
            services={bridgeServices}
            unitId={unitId}
            sheetId="sheet-1"
            sheetName="Sheet1"
            imperativeRef={importExportRef}
          />
        </div>
      )}

      {/* ── Univer spreadsheet canvas ──────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {showFormulaRef && (
          <FormulaReferencePanel onClose={() => setShowFormulaRef(false)} />
        )}
        {/*
          Signer recovery overlay (Part 2 of signer-resilience design).
          Shown when a save fails after retries are exhausted. It sits
          above the spreadsheet canvas so the document remains visible and
          the user knows their work is not gone. Session state is untouched.
          There is deliberately no credential prompt here.
        */}
        {signerError !== null && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ maxWidth: 480, width: '90%' }}>
              <SignerRecovery
                error={signerError}
                retrying={retryingSave}
                onRetry={() => {
                  void handleSave()
                }}
                onGoBack={() => setSignerError(null)}
              />
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          // Adding `dark` when the app is in dark mode activates all of
          // Univer's `dark:` Tailwind variants — the toolbar, dropdowns,
          // dialogs and the "name manager" dropdown included.  Without this,
          // Univer renders a white-background light theme regardless of the
          // user's preference.
          className={resolvedTheme === 'dark' ? 'univer-container dark' : 'univer-container'}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <div style={{
        padding: '0.375rem 0.75rem',
        backgroundColor: 'var(--cloistr-bg-hover)',
        borderTop: '1px solid var(--cloistr-border)',
        fontSize: '0.8125rem',
        color: 'var(--cloistr-text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
        flexShrink: 0,
        minHeight: 44,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '30%' }}>
          {documentId}
        </span>
        {!bridgeAttached && (
          <span style={{ color: 'var(--cloistr-error)', fontSize: '0.75rem' }}>
            Edits are not being saved — the spreadsheet bridge failed to start
          </span>
        )}
        <span>
          {isConnected ? 'Connected' : 'Disconnected'}
          {' · '}
          {peerCount + 1} user{peerCount > 0 ? 's' : ''} online
          {' · '}
          {persistenceState.loading && !persistLoadSettled ? 'Loading...' :
           persistenceState.saving ? 'Saving...' :
           persistenceState.lastSave ? `Saved ${new Date(persistenceState.lastSave.timestamp).toLocaleTimeString()}` :
           'Not saved'}
        </span>
        <button
          onClick={handleSave}
          disabled={!persistenceState.initialized || persistenceState.saving || retryingSave || !persistenceState.dirty}
          style={{
            padding: '0.25rem 0.75rem',
            minHeight: 44,
            fontSize: '0.8125rem',
            border: '1px solid var(--cloistr-border)',
            borderRadius: '0.25rem',
            backgroundColor: persistenceState.dirty ? 'var(--cloistr-info)' : 'var(--cloistr-success)',
            color: 'white',
            cursor: persistenceState.dirty ? 'pointer' : 'default',
            opacity: (!persistenceState.initialized || persistenceState.saving || retryingSave || !persistenceState.dirty) ? 0.5 : 1,
          }}
        >
          {persistenceState.saving || retryingSave ? 'Saving...' : persistenceState.dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </div>
  )
}
