import { defineConfig, devices } from '@playwright/test';

// Browser test tier for 016-theme-support (plan D-005). Runs against a local
// static server serving the repo root, so real artifacts load their shared
// assets over http. Kept out of the vitest glob (packages/**/*.test.ts).
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${process.env.TEST_PORT || 4319}`,
    trace: 'on-first-retry',
    // The FR-008 theme cross-fade is guarded by prefers-reduced-motion; running
    // tests reduced makes colour/contrast assertions read the SETTLED state
    // deterministically instead of racing the .35s transition.
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/serve-test.mjs',
    url: `http://localhost:${process.env.TEST_PORT || 4319}/assets/spec.css`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
