import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npx http-server -p 8934 -c-1 .',
    port: 8934,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:8934',
  },
});
