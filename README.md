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
└── icons/
    ├── icon.svg
    ├── icon-maskable.svg
    ├── icon-192.png
    └── icon-512.png
```

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

Palette extracted from the brand reference site, [chgolfco.com](https://chgolfco.com/).

| Token | Value | Role |
|-------|-------|------|
| Ink | `#0A0B0B` | Primary brand surface |
| Black | `#000000` | Nav, buttons, deepest surface |
| Tan | `#B69571` | Brand accent — CTAs, taglines |
| Sand | `#EEDAB8` | Accent light — badges |
| Surface | `#F5F5F5` | Secondary background |
| Border | `#E5E5E5` | Hairlines |
| Subtext | `#4D4D4D` | Muted copy |

**Type:** Bebas Neue (headings, subheadings, CTAs) · Bricolage Grotesque (body, nav, forms).

> The earlier table here documented `#1B4332 / #C9A84C / #1C1C1E / #f2f2f7`. Those
> values were never in `styles.css` — the doc had drifted from the code. Every
> colour now lives in the `:root` block of `docs/styles.css`; change it there.

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
