# collab-common 0.7.1 load gate in sheets — requirements

Before collab-common 0.7.1 a relay that connected but never answered the
snapshot query looked like "no sheet". Sheets additionally started the
spreadsheet engine on mount and seeded four starter cells (A1:B2) into the
shared document before the saved sheet loaded, and treated a load stuck for 12
seconds as complete.

- R1 No save path (status button, File menu, Ctrl+S, signer retry) attempts a
  save unless `loadStatus === 'loaded'`; when blocked it says why.
- R2 The engine starts, and starter cells are seeded, only after a confirmed
  load, and only into an empty sheet. The 12 second workaround is removed.
- R3 The workbook is built from the loaded document, so the first edit after a
  load never deletes loaded cells (regression test fails on the version that
  built it from the starter cells).
- R4 A failed load shows an error with Retry, never a blank grid.
- R5 Live: an edit after sign-in never replaces an existing sheet; a relay that
  connects but never answers shows the error.
