import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5200,
    strictPort: true,
    host: true,
    // The shared package lives outside client/ (npm workspace symlink).
    fs: { allow: ['..'] },
  },
  preview: { port: 5200, strictPort: true },
  build: {
    outDir: 'dist',
    rollupOptions: { input: { main: 'index.html', lookdev: 'lookdev.html' } },
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
