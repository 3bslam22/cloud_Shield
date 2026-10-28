import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.FASTAPI_PROXY_TARGET || 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: ['3000-iearuijwome7253qtkjc1-06912da2.sg2.manus.computer'],
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
            if (/node_modules\/(recharts|d3-|victory-vendor)/.test(id)) return 'charts-vendor';
            if (id.includes('node_modules/lucide-react/')) return 'icons-vendor';
            return undefined;
          },
        },
      },
    },
  };
});
