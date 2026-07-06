import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['@mediapipe/tasks-vision'],
  },
  // MediaPipe publica .map inexistente; silenciamos el warning en dev
  server: {
    sourcemapIgnoreList(sourcePath) {
      return sourcePath.includes('@mediapipe');
    },
    sourcemap: false,
  },
  build: {
    sourcemap: false,
  },
})
