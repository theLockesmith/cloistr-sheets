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
    // Source maps require rollup to maintain position tables through the entire
    // minification pipeline, adding ~30-50% render-phase memory overhead.
    // With this off, the build clears the 1536 MB NODE_OPTIONS ceiling comfortably.
    // Enable locally via VITE_SOURCEMAP=true if needed for debugging.
    sourcemap: false,
  },
})
