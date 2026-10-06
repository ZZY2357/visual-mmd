import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

/**
 * DOM 契约冒烟夹具的专用 Vite 配置（ticket 08）。
 *
 * 为什么不复用根 vite.config.ts：根配置带 PWA 插件与 `base: '/visual-mmd/'`（GitHub
 * Pages 子路径），对静态夹具是纯噪音且会把 URL 拼歪。本配置只做一件事——以仓库根为
 * root 提供夹具页（`/e2e/harness/index.html`），让夹具里 `../../src/...` 的导入与
 * mermaid 的 node_modules 解析走 Vite 默认管线，不引入任何构建产物。
 *
 * 夹具是 dev-only：冒烟只 `vite`（dev server）跑，不产 dist、不进生产构建。
 */
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  root: repoRoot,
  base: '/',
  // 夹具页在 e2e/ 下，Vite 需要允许读取仓库根内文件（默认 root 内即可，显式声明更稳）
  server: {
    fs: { allow: [repoRoot] },
  },
  // 夹具不需要 React 插件（纯 DOM + mermaid），但保持最小化即可
  plugins: [],
})
