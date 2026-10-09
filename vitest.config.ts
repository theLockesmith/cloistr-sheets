/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    // The bridge logic is pure plus an injected fake Univer — no DOM needed,
    // so no jsdom and no native build deps in CI.
    environment: 'node',
    // .tsx: component render tests opt into jsdom per file (@vitest-environment).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    pool: 'forks',
  },
})
