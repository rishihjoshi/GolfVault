# ⛳ Clubhouse Golf PWA

**Premium Golf Accessories, Coaching, Video Lessons & AI Swing Analysis**

A mobile-first Progressive Web App built for iOS and Android, deployable to GitHub Pages.

[![Deploy to GitHub Pages](https://github.com/actions/deploy-pages/workflows/deploy.yml/badge.svg)](../../actions)

---

## 🚀 Live Demo

After deploying to GitHub Pages: `https://<your-username>.github.io/<repo-name>/`

> **Deploy paths are repo-name-agnostic.** `start_url`/`scope` in
> `manifest.json` and every pre-cache URL in `sw.js` are relative, resolved at
> runtime against the manifest and service-worker locations. Rename the repo,
> move it to a domain root, or attach a custom domain and nothing needs
> editing — just bump `CACHE_NAME` so installed clients re-fetch.

---

## 📱 Features

| Tab | Feature |
|-----|---------|
| 🛍 **Shop** | 20 golf products across 4 categories · Cart with badge · Product detail sheets |
| 📅 **Book** | 3 coach profiles · Calendar date picker · Session type/duration selector · Booking confirmation |
| 🎬 **Lessons** | 10 video courses · Topic filters · Locked/unlocked states · Progress tracking |
| 🏌 **Swing** | Video upload UI · Upload progress · Submission inbox · Frame-by-frame coach feedback |
| 🤖 **AI Chat** | Claude-powered golf advisor · Floating FAB · Your own Anthropic API key |

---

## 🛠 Tech Stack

- **Pure HTML/CSS/JS** — no framework, no build step
- **PWA**: Service worker (cache-first), Web App Manifest, install prompts
- **AI**: Anthropic Claude API (browser-side via `anthropic-dangerous-direct-browser-access`)
- **Data**: Static JSON files in `/docs/data/`
- **Hosting**: GitHub Pages from `/docs` folder

---

## 📂 File Structure

```
docs/
├── index.html          # App shell, bottom nav, tab routing
├── app.js              # All logic: shop, booking, lessons, swing, AI chat
├── styles.css          # Design system (deep green + gold premium theme)
├── manifest.json       # PWA manifest (portrait, standalone)
├── sw.js               # Service worker (cache-first)
├── data/
│   ├── products.json   # 20 sample golf products
│   ├── coaches.json    # 3 coach profiles with availability
│   ├── courses.json    # 10 video courses (locked/unlocked)
│   └── submissions.json # Sample swing submissions with feedback
├── assets/
│   ├── clubhouse-mark.svg       # "C" monogram for dark grounds
│   └── clubhouse-mark-light.svg # "C" monogram for ivory grounds
└── icons/
    ├── icon.svg
    ├── icon-maskable.svg
    ├── icon-192.png
    └── icon-512.png
```

Every mark is generated from one vector definition:

```bash
node generate-icons.mjs
```

`brand-mark.mjs` holds the monogram as analytic geometry and renders it two
ways — as SVG elements, and as a point sampler the supersampling rasteriser in
`generate-icons.mjs` uses to write the PNGs. Nothing is ever upscaled from a
raster, so editing the geometry there updates the favicon, the app icons, the
maskable icon and the in-app logo together.

---

## 🚀 Deploy to GitHub Pages

### Option 1: GitHub Actions (Automatic)

1. Go to **Settings → Pages**
2. Set **Source** to `GitHub Actions`
3. Push to `main` — the workflow in `.github/workflows/deploy.yml` handles the rest

### Option 2: Manual from /docs

1. Go to **Settings → Pages**
2. Set **Source** to `Deploy from a branch`
3. Branch: `main`, Folder: `/docs`
4. Save — your site will be live at `https://<username>.github.io/<repo-name>/`

> **Note:** No path configuration is required. `manifest.json` and `sw.js` use
> relative URLs, so the app runs correctly at any deploy path.

---

## 🤖 AI Golf Assistant Setup

1. Get your API key at [console.anthropic.com](https://console.anthropic.com/account/keys)
2. Open the app → tap the 🤖 button
3. Tap ⚙️ Settings → enter your API key
4. Start asking golf questions!

Your key is stored in `localStorage` — never sent to our servers.

---

## 🎨 Design System

The six brand colours. The working combination is **Deep Green + Ivory +
Muted Gold + Onyx**; sage and charcoal are supporting tones.

| Token | Value | Role |
|-------|-------|------|
| Deep Clubhouse Green | `#0B2F24` | Primary brand colour — header, hero, dark panels |
| Almost Black / Onyx | `#0A0D0C` | Backgrounds, nav, apparel, premium applications |
| Muted Masters Gold | `#C49A43` | Flag, accents, trim, buttons |
| Warm Ivory | `#F2EFE8` | Wordmark, light backgrounds, contrast |
| Muted Sage / Moss | `#53695C` | Secondary green, lifestyle graphics |
| Charcoal | `#252B28` | Supporting neutral |

**Type:** Bebas Neue (headings, subheadings, CTAs) · Bricolage Grotesque (body, nav, forms).

> Every colour lives in the `:root` block of `docs/styles.css` as a `--ch-*`
> token; the rest of the sheet references those, so a palette change is a
> one-block edit. Text colours in this palette were checked against WCAG AA on
> both the ivory and deep-green grounds.

---

## 🔌 Integration Hooks

| Feature | Hook |
|---------|------|
| Checkout | Stripe Elements |
| Coaching Booking | Calendly embed |
| Video Library | Teachable embed |
| Swing Analysis | CoachNow / V1 Golf API |

---

## 📋 PWA Quality Gates

- [x] Service worker with cache-first strategy
- [x] Web App Manifest (portrait, standalone)
- [x] Install prompt — Android `beforeinstallprompt`
- [x] iOS install instruction banner
- [x] Offline mode with banner
- [x] No `viewport-fit=cover` — safe area handled via html background colour match
- [x] Cart persists across sessions (`localStorage`)
- [x] Video progress persists (`localStorage`)
- [x] URL hash routing (`#shop`, `#book`, `#lessons`, `#swing`)
- [x] All four tabs render at 390px mobile width
- [x] AI chat with exponential backoff retry

---

## 🔧 Local Development

```bash
# Serve the /docs folder — any static server works
npx serve docs
# or
python -m http.server 8080 --directory docs
# then open http://localhost:8080
```

> **Important:** The PWA must be served over HTTP/HTTPS — not `file://` — for the service worker to register.

---

## 📄 License

MIT — use freely for personal and commercial projects.
