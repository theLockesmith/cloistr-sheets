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
    // sourcemap: true caused peak V8 heap ~2 GB in CI (kaniko/bare-metal, no swap).
    // Source maps add ~30-50% memory overhead through the entire rollup render
    // and minification pipeline. Disabled for production builds; enable locally
    // with VITE_SOURCEMAP=true if needed.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy dependencies into separate chunks so rollup renders
        // them independently rather than holding the entire bundle in memory
        // at once. UniverJS alone is ~10 packages including a WebGL render
        // engine and formula engine; without splitting, peak heap reached
        // ~2 GB during the chunk render phase.
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-univer-core': [
            '@univerjs/core',
            '@univerjs/design',
            '@univerjs/themes',
            '@univerjs/ui',
          ],
          'vendor-univer-sheets': [
            '@univerjs/sheets',
            '@univerjs/sheets-ui',
            '@univerjs/sheets-formula',
            '@univerjs/sheets-formula-ui',
          ],
          'vendor-univer-engine': [
            '@univerjs/engine-formula',
            '@univerjs/engine-render',
            '@univerjs/docs',
            '@univerjs/docs-ui',
          ],
          'vendor-collab': ['yjs', 'rxjs'],
          'vendor-xlsx': ['xlsx'],
        },
      },
    },
  },
})
