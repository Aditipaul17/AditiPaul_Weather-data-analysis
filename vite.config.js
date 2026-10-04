import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || (process.env.NODE_ENV === 'production' ? '/AditiPaul_Weather-data-analysis/' : '/'),
})
