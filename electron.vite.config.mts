import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

// Entries follow electron-vite's defaults: src/main/index.ts, src/preload/index.ts, and
// src/renderer/index.html. React is bundled into the renderer, so the packaged app ships no
// node_modules at all.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
