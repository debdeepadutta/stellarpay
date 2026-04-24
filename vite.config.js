import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Only load tailwindcss plugin if NOT in Vitest to avoid lightningcss binary issues in CI
    !process.env.VITEST && tailwindcss(),
    nodePolyfills({
      // Polyfill Buffer and process — required by Stellar SDK in the browser
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  optimizeDeps: {
    include: ['@stellar/freighter-api'],
  },
  css: {
    transformer: 'postcss',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
