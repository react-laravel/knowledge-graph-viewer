import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  test: {
    // 默认 node 环境，store 测试不依赖 DOM
  },
})
