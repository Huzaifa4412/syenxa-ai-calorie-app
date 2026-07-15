import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const webhookUrl = env.N8N_MEAL_WEBHOOK_URL
  const webhook = webhookUrl ? new URL(webhookUrl) : null

  return {
    plugins: [react(), tailwindcss()],
    server: webhook ? {
      proxy: {
        '/api/meal-analysis': {
          target: webhook.origin,
          changeOrigin: true,
          secure: true,
          timeout: 300000,
          proxyTimeout: 300000,
          rewrite: () => `${webhook.pathname}${webhook.search}`,
        },
      },
    } : undefined,
  }
})
