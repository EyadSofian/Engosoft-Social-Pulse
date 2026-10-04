import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:4100' } },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client'],
          motion: ['motion', 'framer-motion'],
          vendor: ['luxon', 'lucide-react'],
        },
      },
    },
  },
});
