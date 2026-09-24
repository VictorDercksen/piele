import { defineConfig } from '@playwright/test';

// Override when another app already uses 4200, e.g. PIELE_WEB_PORT=4300.
const port = process.env['PIELE_WEB_PORT'] ?? '4200';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 3,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  reporter: 'list',
  webServer: {
    command: `npm start -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
  },
});
