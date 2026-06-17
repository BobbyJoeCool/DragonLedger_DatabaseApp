import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['verbose'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
