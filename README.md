# ⛳ GolfVault PWA

**Premium Golf Accessories, Coaching, Video Lessons & AI Swing Analysis**

A mobile-first Progressive Web App built for iOS and Android, deployable to GitHub Pages.

[![Deploy to GitHub Pages](https://github.com/actions/deploy-pages/workflows/deploy.yml/badge.svg)](../../actions)

---

## 🚀 Live Demo

After deploying to GitHub Pages: `https://<your-username>.github.io/GolfVault/`

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
4. Save — your site will be live at `https://<username>.github.io/GolfVault/`

> **Note:** After deployment, update the `"start_url"` and `"scope"` in `manifest.json` and the cache URLs in `sw.js` if your repository name differs from `GolfVault`.

---

## 🤖 AI Golf Assistant Setup

1. Get your API key at [console.anthropic.com](https://console.anthropic.com/account/keys)
2. Open the app → tap the 🤖 button
3. Tap ⚙️ Settings → enter your API key
4. Start asking golf questions!

Your key is stored in `localStorage` — never sent to our servers.

---

## 🎨 Design System

| Token | Value |
|-------|-------|
| Primary Green | `#1B4332` |
| Accent Gold | `#C9A84C` |
| Charcoal (Nav) | `#1C1C1E` |
| Background | `#f2f2f7` |

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
