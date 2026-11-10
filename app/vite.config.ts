import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Deux pages : la console (index.html) et la fenêtre de sortie (output.html).
export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: {
    target: ['es2022', 'safari16'],
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        output: resolve(__dirname, 'output.html'),
      },
    },
  },
});
