import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        start_url: '/',
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
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
