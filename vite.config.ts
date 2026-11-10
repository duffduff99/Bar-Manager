import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backend = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      ['/api', '/uploads', '/manifest.webmanifest', '/app-icon-192.png', '/app-icon-512.png'].map(
        (path) => [path, backend],
      ),
    ),
  },
});
