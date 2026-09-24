import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: process.env.E2E_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
