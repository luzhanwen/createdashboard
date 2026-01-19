import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({
    jsxRuntime: 'automatic' // ✅ 启用React 17+新JSX转换
  })],
  resolve: {
    alias: {
      '@': '/src' // 确保路径别名正确
    }
  },
  server: {
    port: 3000,
    open: true
  }
})