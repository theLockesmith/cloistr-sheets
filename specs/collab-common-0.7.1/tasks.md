# collab-common 0.7.1 load gate in sheets — tasks

- [x] Gate tests first, red, then `persistenceGate.ts` (verified: 10/10 after red)
- [x] Save paths, menu, status, overlay; 12 second workaround removed (verified: Sheet.tsx diff)
- [x] Engine starts only after load (verified: live D shows no grid under a silent relay)
- [x] Workbook built from the loaded doc; regression test red on the starter-cells version, green after (verified: univer-yjs-bridge.test.ts, 'expected undefined to deeply equal loaded-a' before the fix)
- [x] collab-common ^0.7.1, one copy each of collab-common, ui, auth, yjs (verified: lockfile)
- [x] 129/129 tests, tsc, image, runtime-config browser check (verified: under the heavy-job lock)
- [x] Live on the local build under real sign-in with a throwaway account: A-E (verified: all PASS)
