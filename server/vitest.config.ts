import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    reporters: ['verbose'],
    setupFiles: ['./src/__tests__/setup.ts'],
    // Vitest 4's own configDefaults.exclude dropped '**/dist/**' (only
    // node_modules/.git now) — without this, a compiled `npm run build`
    // leaves server/dist/__tests__/*.test.js sitting next to the real
    // src/__tests__/*.test.ts sources, and vitest runs both copies against
    // the same live dev.db in parallel, producing spurious failures from
    // duplicate/racing test data rather than any real bug.
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
})
