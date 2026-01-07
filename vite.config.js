import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 443,
    allowedHosts: ['x23.i247.com'],
    proxy: {
      '/rpc': {
        target: 'https://x24.i247.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Remove duplicate CORS headers from the proxied response
            delete proxyRes.headers['access-control-allow-origin'];
            proxyRes.headers['access-control-allow-origin'] = '*';
          });
        }
      }
    }
  }
})
