import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 项目站挂在 https://zzy2357.github.io/visual-mmd/ 子路径下
const BASE = '/visual-mmd/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Visual MMD — 可视化 Mermaid 编辑器',
        short_name: 'Visual MMD',
        description: '无需学习 Mermaid 语法即可画图的可视化编辑器',
        lang: 'zh-CN',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        background_color: '#ffffff',
        theme_color: '#228be6',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallback: `${BASE}index.html`,
        // zenuml 与主包 chunk 均超过默认 2 MiB，需纳入离线预缓存
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
