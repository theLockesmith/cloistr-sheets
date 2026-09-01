import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@cloistr/auth'],
  },
  server: {
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    // sourcemap — OFF in CI by default. Deliberate loss of production
    // stack-trace readability, accepted for a specific reason.
    //
    // Previously sourcemap: true. Sheets' render/minify phase peaks near 2 GB
    // of V8 heap: 10 @univerjs/* packages (a full Excel engine plus a WebGL
    // render pipeline), ~2800 modules. Source maps make rollup carry
    // source-position tables through the whole minification pipeline, and that
    // overhead pushed the peak above EVERY ceiling we set on resource-bounded
    // bare-metal CI hosts: 1536 MB -> 1528 observed, 2048 MB -> 2019 observed.
    //
    // The staircase IS the finding. A peak that rises to meet each new ceiling
    // is not a sizing problem, so raising NODE_OPTIONS defers the failure
    // rather than fixing it. The 1536 MB ceiling is now a backstop, not the
    // active constraint.
    //
    // Set VITE_SOURCEMAP=true for a local build when you need maps. CI leaves
    // it unset. (An earlier comment here promised this env override while the
    // value was hardcoded false — the promise is now actually implemented.)
    //
    // DO NOT restore an unconditional `true` to make the fleet consistent: it
    // reintroduces the OOM. Fleet state is cloistr-docs / -space / -slides
    // true, cloistr-whiteboard unset (false by default), sheets conditional.
    // That inconsistency should be resolved deliberately, not from here.
    //
    // Also do NOT reach for manualChunks to cut memory. It was tried on
    // 2026-08-31 and split the @univerjs/* class hierarchy across chunks, so a
    // subclass evaluated before its base class and the app died at load with
    // "Class extends value undefined". The BUILD AND UNIT TESTS BOTH PASSED;
    // only the smoke-test caught it (pipeline 38550).
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
  },
})
