# Portfolio redesign: quality and rollout checklist

## Scope
The `feature/editorial-writing-experience` branch is a standalone Vercel preview. It does not require a pull request and does not update `main`. Existing Express APIs, DEV.to integration, sitemap, resume assets, `/blog/:slug` and `/aruvix` remain in place.

## Design and navigation
- [x] Branded fixed navigation with compact-on-scroll treatment and accessible mobile menu
- [x] Clear AK wordmark and downloadable résumé link in header and contact section
- [x] Shared light/dark preference stored as `portfolio-theme`
- [x] Coordinated colors and typography for home, article reader and Aruvix
- [x] Editorial DEV.to writing section, search, filter, sorting and pagination
- [x] Mobile typography and grids, consistent spacing and focus states
- [x] Reduced-motion fallback and responsive reading layouts
- [x] Existing article SEO, RSS, sitemap and canonical URLs preserved
- [x] Skip unnecessary blocking overlay for server-rendered articles
- [x] Sanitize DEV.to HTML returned by the article API

## Run checks
```bash
npm test
```

## Manual deployment checks
Review the branch deployment at the user's Vercel preview URL on 390px, 768px, 1024px, and 1440px viewports.
1. Test both themes, then navigate from home to /aruvix and to a /blog/:slug URL. The chosen theme should persist.
2. Open and download PDF and Word résumé links; check downloaded files.
3. Test mobile menu, scroll-to-top, article search, topic filters, and Show more.
4. Test API failure or throttling states on the DEV.to feed.
5. Verify article detail renders server-side before JavaScript hydration, without overlay flashes.
6. Run Chrome Lighthouse **on both homepage and article pages** under consistent device/throttling settings.

## Lighthouse interpretation
User-reported baseline on a Vercel preview was Performance 94, Accessibility 92, Best Practices 77, SEO 69. These are **not post-fix measurements**. Lighthouse scores fluctuate based on runtime, caching and throttling. Vercel previews can receive an automatic `X-Robots-Tag: noindex`, which can affect SEO audits and is appropriate for non-production URLs. Do not disable preview noindex simply to raise the score; verify production canonicals and indexability separately.

## Remaining live validation
Automated static checks cannot establish Lighthouse scores or pixel-perfect behavior on a Vercel deployment. Real device/browser testing and a fresh Lighthouse report are required before calling the rollout production-ready.
