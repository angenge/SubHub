import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/sub': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts';
            }
            if (id.includes('qrcode.react')) {
              return 'vendor-qrcode';
            }
            if (id.includes('yaml')) {
              return 'vendor-yaml';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
