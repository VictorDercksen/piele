import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Browser-heavy Angular fixtures need bounded workers to avoid memory pressure and timeouts.
  test: { maxWorkers: 2 },
});
