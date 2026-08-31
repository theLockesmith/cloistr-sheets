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
    // sourcemap: false — deliberate loss of production stack-trace readability.
    //
    // Previously: sourcemap: true. Removed because sheets' render/minify phase
    // peaks at ~2 GB V8 heap (10 @univerjs/* packages including a full Excel
    // engine + WebGL render pipeline, ~2800 modules). sourcemap: true requires
    // rollup to maintain source-position tables through the entire minification
    // pipeline; that overhead drove the peak above every ceiling we set on
    // resource-bounded bare-metal CI hosts (1536 MB → 2048 MB → still OOM).
    //
    // This trade-off was accepted because:
    //   1. The peak rises to meet whatever ceiling is set. Raising NODE_OPTIONS
    //      is not a fix; it defers failure to the next phase.
    //   2. Sheets is the fleet's heaviest bundle. It is reasonable for it to be
    //      the one app that cannot afford in-build source maps.
    //   3. cloistr-whiteboard also builds without source maps (Vite default).
    //
    // Fleet inconsistency: cloistr-docs, cloistr-space, cloistr-slides all have
    // sourcemap: true. cloistr-whiteboard is unset (false by default). This
    // should be made consistent deliberately, not fixed by restoring true here.
    //
    // DO NOT restore sourcemap: true to fix the inconsistency — it will
    // reintroduce the OOM. If maps are needed, use a separate post-build step.
    sourcemap: false,
  },
})
