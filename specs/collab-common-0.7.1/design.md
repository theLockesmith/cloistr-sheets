# collab-common 0.7.1 load gate in sheets — design

`src/lib/persistenceGate.ts`: view, save gate, `shouldStartEditor`, keyed on
`loadStatus`. The Univer init effect runs only when `shouldStartEditor` and
re-runs when it flips. The workbook's sheet-1 cellData is
`initialSheetCells(ydoc, 'sheet-1', STARTER_CELLS)` (bridge module): seed into
an empty doc, then `toCellData`. Needed because the bridge applies Yjs -> Univer
only on later updates; with the engine starting after the load, the loaded
cells are already in the doc. A loading/failed overlay covers the grid
container until ready.
