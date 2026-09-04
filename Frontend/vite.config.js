import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev proxy: with VITE_API_URL unset, the app uses the relative /api origin
// and the Vite dev server forwards /api/* to the backend (no hardcoded
// localhost URL in application code). Override the target with
// VITE_PROXY_TARGET if the API runs elsewhere.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      host: true,
      // The dev server is used behind sandbox/team previews; allow all hosts
      // unless VITE_ALLOWED_HOSTS (comma-separated) is provided. Production
      // uses the static build, so this only affects local development.
      allowedHosts: env.VITE_ALLOWED_HOSTS
        ? env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
        : true,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
      port: Number(process.env.VITE_PORT) || 5173,
      strictPort: true,
    },
  }
})
