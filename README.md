# InteGrowSys website — Astro + Cloudflare

Static-first, responsive company website intended for GitHub and Cloudflare Pages. Domain transfer is not needed when the domain is already managed by Cloudflare.

## Requirements
Install Node.js 22 LTS and Git. Use VS Code or another editor.

## Run locally
```bash
npm install
npm run dev
```
Open the localhost URL printed by Astro.

## Check and build
```bash
npm run check
npm run build
npm run preview
```
The production site is generated into `dist/`.

## Push to GitHub
Create an empty repository on GitHub, then run these commands in this project folder:
```bash
git init
git add .
git commit -m "Initial InteGrowSys Astro website"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/integrowsys-website.git
git push -u origin main
```
Replace `YOUR-USERNAME` with your GitHub username and use the exact repository URL.

## Deploy to Cloudflare Pages
1. Open Cloudflare → Workers & Pages → Create → Pages → Connect to Git (dashboard wording may vary).
2. Authorize GitHub and select this repository.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Root directory: leave blank.
6. Deploy and test the `pages.dev` URL.
7. Add `www.integrowsys.com` and/or `integrowsys.com` under the Pages project's Custom domains, following Cloudflare's prompts. Select a canonical hostname and redirect the other.

This is a static site and does not require a Cloudflare server adapter for the included pages. For future authenticated portals or server-side APIs, add the appropriate Cloudflare runtime separately.

## Edit content
- Home: `src/pages/index.astro`
- Shared header/footer: `src/layouts/MainLayout.astro`
- Styles: `src/styles/global.css`
- Services: Markdown files in `src/content/services/`
- About, projects, resources, contact: matching files in `src/pages/`

Markdown service frontmatter has `title`, `description`, `category`, `order`, and `draft`. Use `draft: true` to omit a service from the published collection.

## Contact enquiries
The contact page uses `mailto:` and `tel:` links. It does not store form submissions or send them to a server. If you add a real form, connect a server-side endpoint or form provider, add spam protection and a privacy notice. Never put SMTP passwords or API keys in browser code or GitHub.

## AlertGuard accuracy
The supplied AlertGuard manual describes an ESP32-based add-on with up to five configurable NO/NC dry-contact relay inputs and email/webhook notifications over Wi-Fi. It does not establish that every installation has Ethernet, LoRa, analog sensor inputs or a full cloud dashboard. Offer those only when verified for the proposed configuration. Confirm product availability, certifications, response commitments and all technical claims before publishing.

## Before going live
- Verify phone numbers, email, address and service coverage.
- Replace capability examples with approved real project references and images.
- Confirm services and product capabilities currently offered.
- Add privacy/terms pages if required by your data collection and analytics.
- Test navigation, links, mobile layout and page metadata.
- Map old Google Sites URLs to the new pages where possible to reduce lost search traffic.

## Future IoT portal
Keep the public marketing site separate from live equipment data and customer login. A future portal should use authenticated APIs, device authentication, access control, audit logs, rate limits and security review.
