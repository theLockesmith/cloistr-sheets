import { useEffect, useRef } from 'react'
import { Univer } from '@univerjs/core'
import { defaultTheme } from '@univerjs/design'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverUIPlugin } from '@univerjs/ui'

// Import Univer styles
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'

export function Sheet() {
  const containerRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<Univer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Initialize Univer
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
    univer.createUniverSheet({
      id: 'sheet-1',
      name: 'Sheet1',
      sheetOrder: ['sheet-1'],
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Sheet1',
          cellData: {
            0: {
              0: {
                v: 'Hello',
              },
              1: {
                v: 'World',
              },
            },
            1: {
              0: {
                v: 'Welcome to',
              },
              1: {
                v: 'Cloistr Sheets',
              },
            },
          },
          rowCount: 1000,
          columnCount: 26,
        },
      },
    })

    univerRef.current = univer

    return () => {
      // Clean up
      univer?.dispose()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="univer-container"
      style={{ width: '100%', height: '100%' }}
    />
  )
}