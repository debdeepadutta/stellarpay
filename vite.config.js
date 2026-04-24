import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig(async () => {
  const plugins = [
    react(),
    nodePolyfills({
      // Polyfill Buffer and process — required by Stellar SDK in the browser
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ];

  // Only load Tailwind plugin if NOT in Vitest.
  // This prevents the 'lightningcss' binary from being loaded during CI tests.
  if (!process.env.VITEST) {
    try {
      const tailwindcss = (await import('@tailwindcss/vite')).default;
      plugins.push(tailwindcss());
    } catch (e) {
      console.warn("Tailwind plugin skipped (likely in test environment)");
    }
  }

  return {
    plugins,
    optimizeDeps: {
      include: ['@stellar/freighter-api'],
    },
  };
});
