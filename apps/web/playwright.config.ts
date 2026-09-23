import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 3,
  use: {
    baseURL: 'http://localhost:4200',
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  reporter: 'list',
  webServer: {
    command: 'npm start -- --host 127.0.0.1',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
  },
});
