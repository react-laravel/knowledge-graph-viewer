import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  test: {
    include: ['tests/**/*.test.js'],
  },
})
