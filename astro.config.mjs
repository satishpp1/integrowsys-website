import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Static-first marketing site for Cloudflare Pages / Workers.
export default defineConfig({
  site: 'https://www.integrowsys.com',
  output: 'static',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()]
  }
});
