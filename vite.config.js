import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  test: {
    include: ['tests/store.test.js'],
  },
})
