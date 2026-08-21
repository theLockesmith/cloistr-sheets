import { useEffect, useRef, useState } from 'react'
import { Univer, LocaleType, Tools } from '@univerjs/core'
import DesignEnUS from '@univerjs/design/lib/locale/en-US.json' with { type: 'json' }
import UIEnUS from '@univerjs/ui/lib/locale/en-US.json' with { type: 'json' }
import SheetsEnUS from '@univerjs/sheets/lib/locale/en-US.json' with { type: 'json' }
import SheetsUIEnUS from '@univerjs/sheets-ui/lib/locale/en-US.json' with { type: 'json' }
import DocsUIEnUS from '@univerjs/docs-ui/lib/locale/en-US.json' with { type: 'json' }
import { defaultTheme } from '@univerjs/design'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverUIPlugin } from '@univerjs/ui'
import * as Y from 'yjs'
import { NostrSyncProvider, useDocumentPersistence } from '@cloistr/collab-common'
import type { SignerInterface } from '@cloistr/auth'
import { attachBridge, seedFromSnapshot, type BridgeHandle } from '../lib/univer-yjs-bridge.js'

// For development, use VITE_BLOSSOM_URL env var or fall back to public server
// Production uses files.cloistr.xyz with platform auth
const BLOSSOM_URL = import.meta.env.VITE_BLOSSOM_URL || 'https://nostr.download'

// Import Univer styles
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'

interface SheetProps {
  signer: SignerInterface
  publicKey: string
  relayUrl: string
  documentId: string
}

export function Sheet({ documentId, signer, publicKey: _publicKey, relayUrl }: SheetProps) {
  // signer, publicKey, relayUrl passed as props
  // Note: _publicKey currently unused, will be used for cursor display
  const containerRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<Univer | null>(null)
  const [ydoc] = useState(() => new Y.Doc())
  const [, setProvider] = useState<NostrSyncProvider | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const bridgeRef = useRef<BridgeHandle | null>(null)
  // Surfaced in the status bar: if the bridge is not attached, nothing the user
  // types can be saved, and they should be told rather than left to discover it
  // when their work vanishes.
  const [bridgeAttached, setBridgeAttached] = useState(true)

  // Workaround for a bug in @cloistr/collab-common 0.2.14:
  // DocumentPersistence.load() returns {found: false} for new documents via an
  // early return that never calls this.onLoad?(). The hook's onLoad handler is
  // the only place that sets loading:false, so loading stays true forever when
  // no snapshot exists. The fix belongs in collab-common (call onLoad even on
  // the not-found path), but until that release lands, we detect the stuck state
  // here: once initialized is true, loading must clear within the relay's 10s
  // EOSE timeout. We wait 12s (a margin above that) and then settle regardless.
  const persistLoadSettledRef = useRef(false)
  const [persistLoadSettled, setPersistLoadSettled] = useState(false)

  // Initialize NostrSyncProvider
  useEffect(() => {
    const syncProvider = new NostrSyncProvider(ydoc, {
      signer,
      relayUrl,
      docId: documentId,
    })

    syncProvider.onConnect = () => {
      console.log('[Sheet] Connected to relay')
      setIsConnected(true)
    }

    syncProvider.onDisconnect = () => {
      console.log('[Sheet] Disconnected from relay')
      setIsConnected(false)
    }

    syncProvider.onPeersChange = (count: number) => {
      console.log(`[Sheet] Peer count: ${count}`)
      setPeerCount(count)
    }

    syncProvider.onError = (error: Error) => {
      console.error('[Sheet] Sync error:', error)
    }

    syncProvider.connect().catch(console.error)
    setProvider(syncProvider)

    return () => {
      syncProvider.destroy()
    }
  }, [documentId, ydoc, signer, relayUrl])

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

  const handleSave = async () => {
    try {
      await persistenceControls.save()
    } catch (error) {
      console.error('[Sheet] Save failed:', error)
    }
  }

  // Detect the stuck loading state caused by the collab-common 0.2.14 bug.
  // When loading clears naturally (snapshot found or error), settle immediately.
  // If loading is still true after initialization, start a 12-second timeout as
  // the backstop (12s > the relay's 10s EOSE timeout in fetchLatestSnapshotEvent).
  useEffect(() => {
    if (persistLoadSettledRef.current) return
    if (!persistenceState.initialized) return

    if (!persistenceState.loading) {
      // Cleared naturally by onLoad or onError -- settle immediately
      persistLoadSettledRef.current = true
      setPersistLoadSettled(true)
      return
    }

    // loading is true and initialized is true: the load is in flight or stuck.
    // Give it up to 12 seconds, then treat it as done.
    const timer = setTimeout(() => {
      if (!persistLoadSettledRef.current) {
        console.warn(
          '[Sheet] persistenceState.loading stuck after initialization -- ' +
          'likely collab-common 0.2.14 bug (load() returns {found:false} without calling onLoad). ' +
          'Treating load as complete.'
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
      // Univer 0.1.x renders nothing (blank grid, stuck) without a locale;
      // "Locale not initialized" was the tell. Merge the en-US bundles from
      // each registered plugin package.
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: Tools.deepMerge(
          {},
          SheetsEnUS,
          SheetsUIEnUS,
          DocsUIEnUS,
          UIEnUS,
          DesignEnUS,
        ),
      },
    })

    // Register plugins
    univer.registerPlugin(UniverRenderEnginePlugin)
    // Formula engine must be registered or the sheet logs
    // "base-formula-engine not registered" and formulas never compute.
    univer.registerPlugin(UniverFormulaEnginePlugin)
    univer.registerPlugin(UniverUIPlugin, {
      container: containerRef.current,
    })
    // The docs plugins are NOT optional for a spreadsheet, despite the name.
    // In Univer 0.1.x the sheets cell editor is built on the docs text engine,
    // so sheets-ui injects doc services; without these registered, redi cannot
    // resolve them and the whole app dies at bootstrap before rendering:
    //   Uncaught Error: [redi]: Cannot find "Sr" registered by any injector.
    //   The stack of dependencies is: "vy -> Sr"
    // They must also come BEFORE the sheets plugins -- redi resolves in
    // registration order, so registering them after leaves the same gap.
    univer.registerPlugin(UniverDocsPlugin)
    univer.registerPlugin(UniverDocsUIPlugin)
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin)

    // Create the workbook, then bridge it to Yjs (see lib/univer-yjs-bridge.ts).
    // Until that bridge existed, cell edits never entered the Yjs document, so
    // nothing was ever dirty, nothing ever saved, and every reload restored the
    // starter sheet below.
    univer.createUniverSheet({
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

    // Seed Yjs from the starter sheet only when the document is genuinely
    // empty — a snapshot restored by useDocumentPersistence must win over the
    // sample data, or loading a real sheet would overwrite it with Hello/World.
    seedFromSnapshot(ydoc, 'sheet-1', {
      0: { 0: { v: 'Hello' }, 1: { v: 'World' } },
      1: { 0: { v: 'Welcome to' }, 1: { v: 'Cloistr Sheets' } },
    })

    const bridge = attachBridge({ doc: ydoc, univer, sheetId: 'sheet-1' })
    bridgeRef.current = bridge
    setBridgeAttached(bridge.attached)
    if (!bridge.attached) {
      console.error(
        `[sheets] Yjs bridge did not attach (${bridge.reason}) — edits will not be saved`,
      )
    }

    return () => {
      bridgeRef.current?.dispose()
      bridgeRef.current = null
      univer?.dispose()
    }
  }, [documentId, ydoc])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        ref={containerRef}
        className="univer-container"
        style={{ flex: 1, width: '100%' }}
      />
      <div style={{
        padding: '0.5rem 1rem',
        backgroundColor: 'var(--cloistr-bg-hover)',
        borderTop: '1px solid var(--cloistr-border)',
        fontSize: '0.875rem',
        color: 'var(--cloistr-text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>Document: {documentId}</span>
        {!bridgeAttached && (
          <span style={{ color: 'var(--cloistr-error)' }}>
            ⚠ Edits are not being saved — the spreadsheet bridge failed to start
          </span>
        )}
        <span>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          {' · '}
          {peerCount + 1} user{peerCount > 0 ? 's' : ''} online
          {' · '}
          {persistenceState.loading && !persistLoadSettled ? '⏳ Loading...' :
           persistenceState.saving ? '💾 Saving...' :
           persistenceState.lastSave ? `✓ Saved ${new Date(persistenceState.lastSave.timestamp).toLocaleTimeString()}` :
           '○ Not saved'}
        </span>
        <button
          onClick={handleSave}
          disabled={!persistenceState.initialized || persistenceState.saving || !persistenceState.dirty}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            border: '1px solid var(--cloistr-border)',
            borderRadius: '0.25rem',
            backgroundColor: persistenceState.dirty ? 'var(--cloistr-info)' : 'var(--cloistr-success)',
            color: 'white',
            cursor: persistenceState.dirty ? 'pointer' : 'default',
            opacity: (!persistenceState.initialized || persistenceState.saving || !persistenceState.dirty) ? 0.5 : 1,
          }}
        >
          {persistenceState.saving ? 'Saving...' : persistenceState.dirty ? 'Save' : 'Saved'}
        </button>
      </div>
    </div>
  )
}
