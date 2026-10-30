import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static-first marketing site for Cloudflare Pages.
export default defineConfig({
  site: 'https://www.integrowsys.com',
  output: 'static',
  integrations: [sitemap()]
});
