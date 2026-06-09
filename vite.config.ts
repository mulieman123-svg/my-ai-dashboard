import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({mode, command}) => {
  const env = loadEnv(mode, '.', '');
  const isBuild = command === 'build';

  return {
    base: './',
    plugins: [
      react(), 
      tailwindcss(),
      ...(isBuild ? [
        viteSingleFile(),
        {
          name: 'clean-webview-html',
          enforce: 'post' as const,
          transformIndexHtml(html) {
            return html
              .replace(/type="module"/g, '')
              .replace(/crossorigin="[^"]*"/g, '')
              .replace(/crossorigin/g, '')
              .replace(/rel="modulepreload"/g, 'rel="preload" as="script"');
          }
        }
      ] : [])
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    build: {
      cssCodeSplit: false,
      assetsInlineLimit: 100000000,
      rollupOptions: {
        output: {
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
