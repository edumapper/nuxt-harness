import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // CLI tests spawn the gate several times per case (~1 s each on CI runners)
    testTimeout: 30_000
  }
})
