import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['apple-touch-icon.png'],
    manifest: { name: 'Klar – Deine Aufgaben', short_name: 'Klar', description: 'Deine Aufgaben. Ein klarer Kopf.', lang: 'de', start_url: '.', scope: '.', display: 'standalone', background_color: '#f7f8f4', theme_color: '#265c48', icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'], navigateFallback: 'index.html' }
  })]
});
