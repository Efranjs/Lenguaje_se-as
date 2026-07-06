import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  // MediaPipe publica .map inexistente; no afecta la app, solo ensucia la consola
  server: {
    sourcemapIgnoreList(sourcePath) {
      return sourcePath.includes('@mediapipe');
    },
  },
})
