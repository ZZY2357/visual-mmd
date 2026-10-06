import { defineConfig, devices } from '@playwright/test'

/**
 * DOM 契约冒烟的 Playwright 配置（ticket 08）。
 *
 * 与 vitest 完全隔离：testDir 指 e2e/，且根 vite.config.ts 的 vitest `include` 只收
 * `src/**\/*.test.{ts,tsx}`，所以 `npm test` 不会捡到本目录下的 `.spec.ts`。
 * 只装/只跑 chromium（CI 里 `npx playwright install --with-deps chromium`）。
 *
 * 总时长硬上限（ticket：约 30 秒级，超时即失败）：globalTimeout 30s 封顶整个套件，
 * 单用例 25s。夹具是静态页 + 31 帧 mermaid 渲染，实测远低于此；超时说明出了真问题。
 */
export default defineConfig({
  testDir: './e2e',
  // 只收冒烟用例（夹具的 .ts 不是测试文件）
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : 'line',
  // 总时长硬上限：超时即失败（ticket 要求）
  globalTimeout: 30_000,
  timeout: 25_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:5199',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      // channel: 'chromium' 用完整 chromium 构建（而非 playwright 默认的
      // chromium-headless-shell）。CI 只 `playwright install chromium`，显式指定可避免
      // 依赖 headless-shell 这一独立下载产物。
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    // 静态夹具用专用 Vite 配置（无 PWA 插件、base 为 /），只做 dev server
    command: 'npx vite --config e2e/vite.harness.config.ts --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199/e2e/harness/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
