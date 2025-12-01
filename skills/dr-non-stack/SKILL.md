---
name: dr-non-stack
description: >-
  Dr. Non's complete project scaffold and design system. Use when starting
  a new project, creating a web application, building a dashboard, setting up
  a landing page, initializing a Next.js or Vite project, scaffolding a database,
  or when the user says "new project", "start", "build me", "create a", "scaffold",
  "set up", or "initialize". Also use when making design decisions about typography,
  spacing, color, layout, hierarchy, SEO, analytics, or deployment. Applies to
  every project Dr. Non works on — dashboards, indices, landing pages, AI tools,
  city monitoring systems, and more.
---

# Dr-Non-Stack

Every project ships with a database, SEO, analytics, and a consistent design system from day one. No exceptions. No "we'll add it later."

## Design Philosophy

**Jony Ive meets Dieter Rams.** Less but better. Remove until it breaks, then add one thing back.

### Don Norman — Design of Everyday Things
- **Affordances**: Elements must suggest how to use them (raised buttons look pressable, pills look tappable)
- **Signifiers**: Visual cues showing where to act (arrows, chevrons, color accents at action points)
- **Feedback**: Immediate response to every interaction (press states, transitions, color shifts)
- **Mapping**: Layout relates to meaning (important flows top→bottom, time flows left→right)
- **Constraints**: Guide the user by limiting visible choices at each step

### Behavioral Economics (Nudge Theory)
- **Anchoring**: Show the most important metric first and largest
- **Default effect**: Pre-select the best option
- **Social proof**: Show visitor counts, usage stats where relevant
- **Loss aversion**: Frame as "don't miss" rather than "you could gain"
- **Progressive disclosure**: Hide complexity, reveal on demand

### Visual Hierarchy
- **Size ladder**: 36px (display) → 24px (section) → 18px (body large) → 16px (body) → 14px (caption) → 12px (micro)
- **Weight ladder**: ExtraBold (800) for headings → Medium (500) for subheads → Regular (400) for body → Light (300) only above 16px
- **Depth**: Subtle shadows on interactive elements, background color shifts for section grouping
- **Spacing**: Generous gaps between sections, tight within — whitespace IS hierarchy
- **Color saturation**: Primary actions in full color, secondary in muted, tertiary in gray

> For complete design system reference, see [references/design-system.md](references/design-system.md)

## Tech Stack Decision Tree

| Need | Stack |
|------|-------|
| Web service with API routes, SSR, or dynamic data | **Next.js** + TypeScript + Tailwind CSS |
| Static site, lightweight, fast build | **Vite** + React + TypeScript + Tailwind CSS |
| Database (default) | **Supabase** (PostgreSQL, Pro plan — 8GB storage, 250GB bandwidth, daily backups) |
| Database (lightweight/static) | **SQLite** via better-sqlite3 or Cloudflare D1 |
| Analytics visualization backup | **Google Sheets** API (parallel to primary DB) |
| Geospatial | **Deck.gl** + **Mapbox GL** (or Leaflet for simpler maps) |
| AI integration | **Claude API** (Opus 4.6) |
| Deployment (web service) | **Render** (free plan, Oregon, auto-deploy from main) |
| Deployment (static) | **GitHub Pages** (with GitHub Actions workflow) |

**Package manager**: npm | **Node**: 20.x+ | **TypeScript**: strict mode

## Project Initialization Checklist

When starting ANY new project, follow every step:

- [ ] **1. Git + GitHub**: Initialize repo, create GitHub repository, push initial commit
- [ ] **2. Framework**: Scaffold with Next.js (`npx create-next-app@latest --typescript --tailwind --app`) or Vite (`npm create vite@latest -- --template react-ts`)
- [ ] **3. Tailwind + Design Tokens**: Configure Tailwind with custom colors, spacing scale (4px grid), font families, border-radius defaults
- [ ] **4. Typography**: Install Inter (body) + Manrope (headings) via `@fontsource/inter` and `@fontsource/manrope`. Configure in Tailwind.
- [ ] **5. TypeScript**: Enable strict mode in tsconfig.json
- [ ] **6. Database**: Set up Supabase project (or SQLite). Create `pageviews` table at minimum. See [references/database-scaffold.md](references/database-scaffold.md)
- [ ] **7. Google Sheets Backup**: Set up parallel Google Sheets for visitor analytics visualization
- [ ] **8. SEO Foundation**: Meta tags component, JSON-LD, sitemap.xml, robots.txt, OG image (1200x630). See [references/seo-checklist.md](references/seo-checklist.md)
- [ ] **9. Analytics**: Add pageview tracking endpoint (`/api/pageview`) writing to Supabase. Track: path, referrer, country, language, user_agent, timestamp
- [ ] **10. Deployment Config**: Create render.yaml (web service) or GitHub Actions workflow (static). See [references/deployment-guide.md](references/deployment-guide.md)
- [ ] **11. CLAUDE.md**: Create project CLAUDE.md with build commands, architecture, and conventions
- [ ] **12. First Deploy**: Commit, push to GitHub, trigger deployment, and **open the live URL in the browser**

> **IMPORTANT**: Localhost doesn't count. Only the live deployed website is a valid result. When work is ready, always: git push → wait for deploy → open the live URL so Dr. Non can evaluate it.

## Database Strategy — CRITICAL

> Dr. Non has lost visitor data in past projects because the database wasn't set up when the system was first built. NEVER skip this step.

**Every project gets at minimum:**
1. A `pageviews` table — tracks every visit with path, referrer, country, language, user_agent, timestamp
2. A project-specific data table (content, rankings, sensor data, whatever the project stores)
3. Google Sheets as a parallel analytics layer — easy to view, visualize, and share

**For dashboards specifically:**
- Store scraped headlines, content summaries, and timestamps in a `content_cache` table
- This enables longitudinal trend analysis — understanding how stories, metrics, and problems evolve over time

> For schemas and setup instructions, see [references/database-scaffold.md](references/database-scaffold.md)

## SEO & Analytics — Always Included

**Essential on every project:**
- `<title>` (50-60 chars) + `<meta description>` (150-160 chars) on every page
- Open Graph: og:title, og:description, og:image (1200x630), og:url, og:type
- Twitter Cards: twitter:card (summary_large_image), mirrors OG
- JSON-LD: WebSite + Organization schema at minimum
- sitemap.xml (auto-generated) + robots.txt + canonical URLs
- Semantic HTML: one `<h1>` per page, logical heading hierarchy, `<article>`, `<nav>`, `<main>`

**Multi-language (when applicable):**
- Subdirectory structure: `/en/`, `/th/`, `/zh/`
- hreflang tags with `x-default` pointing to English
- Use visitor language data to decide which languages to prioritize

**Core Web Vitals:**
- Preload LCP image, no render-blocking CSS/JS
- `font-display: swap` on all custom fonts
- Explicit `width` and `height` on all `<img>` elements
- Lazy load below-fold images

> For complete checklist, see [references/seo-checklist.md](references/seo-checklist.md)

## Deployment

**Render (web services):**
- render.yaml at project root: free plan, Oregon region, auto-deploy from main
- Health check endpoint: `/api/status` returning `{ status: "ok", timestamp }`
- Environment variables: DATABASE_URL, API keys via `sync: false` (never committed)

**GitHub Pages (static sites):**
- GitHub Actions workflow at `.github/workflows/deploy.yml`
- Build → deploy to gh-pages branch
- Dr. Non likes the GitHub domain — it looks technical and techy

**When done, always:**
1. `git add` + `git commit` + `git push`
2. Wait for deployment to complete (Render auto-deploys from main; GitHub Pages via Actions)
3. Open the live URL in the browser for Dr. Non to evaluate
4. Localhost is never a deliverable — only the deployed site counts

> For templates, see [references/deployment-guide.md](references/deployment-guide.md)

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display heading | Manrope | ExtraBold (800) | 36-48px |
| Section heading | Manrope | Bold (700) | 24-30px |
| Subheading | Inter | SemiBold (600) | 18-20px |
| Body text | Inter | Regular (400) | 16px |
| Caption / metadata | Inter | Regular (400) | 14px |
| Micro text | Inter | Medium (500) | 12px |

**Alternatives** (when variety is needed): DM Sans (warmer), Outfit (geometric, punchy bold), Plus Jakarta Sans (confident grotesque)

**Rules:**
- Never use Light weight below 16px — it loses legibility
- Heading/body contrast must be dramatic (ExtraBold vs Regular, not just Bold vs Regular)
- All fonts via Google Fonts or @fontsource for self-hosting

## Free APIs & Data Sources

A comprehensive catalog of 60+ free APIs covering weather, air quality, conflict, economics, finance, demographics, news, aviation, maritime, mapping, transit, and AI — all with signup links, free tier limits, and ready-to-use endpoint examples. No hunting for resources.

> For the full catalog with .env.example blocks, see [references/free-data-sources.md](references/free-data-sources.md)
> For satellite imagery APIs (STAC, COG, Sentinel Hub, Planetary Computer, GEE), see [references/satellite-data-guide.md](references/satellite-data-guide.md)
> For the bulletproof free news pipeline (RSS + API failover + Supabase Realtime), see [references/news-pipeline-guide.md](references/news-pipeline-guide.md)
