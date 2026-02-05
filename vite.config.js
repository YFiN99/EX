import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills' // 1. Impor pluginnya 📦

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    nodePolyfills(), // 2. Aktifkan polyfills di sini 🚀
  ],
})