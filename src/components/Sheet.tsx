import { useEffect, useRef, useState } from 'react'
import { Univer } from '@univerjs/core'
import { defaultTheme } from '@univerjs/design'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverUIPlugin } from '@univerjs/ui'
import * as Y from 'yjs'
import { NostrSyncProvider } from '@cloistr/collab-common'
import { useNostrAuth } from '../App.js'

// Import Univer styles
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'

interface SheetProps {
  documentId: string
}

export function Sheet({ documentId }: SheetProps) {
  const { signer, relayUrl } = useNostrAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<Univer | null>(null)
  const [ydoc] = useState(() => new Y.Doc())
  const [, setProvider] = useState<NostrSyncProvider | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)

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

  // Initialize Univer
  useEffect(() => {
    if (!containerRef.current) return

    const univer = new Univer({
      theme: defaultTheme,
    })

    // Register plugins
    univer.registerPlugin(UniverRenderEnginePlugin)
    univer.registerPlugin(UniverUIPlugin, {
      container: containerRef.current,
    })
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin)

    // Create a new workbook
    // TODO: Sync workbook data through Yjs
    // For now, create initial sheet - full Yjs <-> Univer bridge needs implementation
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

    return () => {
      univer?.dispose()
    }
  }, [documentId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        ref={containerRef}
        className="univer-container"
        style={{ flex: 1, width: '100%' }}
      />
      <div style={{
        padding: '0.5rem 1rem',
        backgroundColor: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        fontSize: '0.875rem',
        color: '#64748b',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Document: {documentId}</span>
        <span>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          {' · '}
          {peerCount + 1} user{peerCount > 0 ? 's' : ''} online
        </span>
      </div>
    </div>
  )
}
