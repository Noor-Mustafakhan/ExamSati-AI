import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fpscApiPlugin } from './server/fpscApiPlugin.js'
import { loadServerEnv } from './server/env.js'

// Load server-side environment variables (.env.local / .env) securely
loadServerEnv()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    fpscApiPlugin(),
  ],
})
