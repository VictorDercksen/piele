import { defineConfig } from '@playwright/test';

// Runs against the production build served with vercel.json headers. Build first.
const port = process.env['PIELE_WEB_PORT'] ?? '4400';

export default defineConfig({
  testDir: './e2e-production',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  reporter: 'list',
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { PIELE_WEB_PORT: port },
  },
});
