import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// SharedArrayBuffer (wasm threads in the slicer and Cycles workers) needs cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: 'es' },
})
