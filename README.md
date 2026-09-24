# Hololand: website

A static site for Hololand (men's panjabi and women's knitwear, Bangladesh). It runs free on GitHub Pages and has no build step.

**What's inside**

| Section | Tech |
|---|---|
| Hero: arch-shaped WebGL window with noise-dissolve slides, silk shader background, mouse ripple, zoom-through on scroll | Three.js custom GLSL |
| Lookbook: 3D ring of arch panels that turns with scroll/drag, bends with speed, click to open | Three.js |
| Footer: interactive particle version of the H mark | Three.js points |
| Smooth scroll, text reveals, marquee, magnetic buttons, custom cursor | GSAP + ScrollTrigger + SplitText, Lenis |
| Shop grid, quick view, bag (saved in the browser), **checkout via WhatsApp** | Vanilla JS |
| AI Stylist (English / বাংলা, voice input) | Groq via a free Cloudflare Worker, with an offline fallback |
| Live Dhaka weather in the nav and the stylist | Open-Meteo (free, no key) |

All libraries are vendored in `assets/vendor/` (no CDN dependency). Fonts come from Google Fonts.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(ES modules need a server; opening `index.html` directly won't work.)

## Deploy to GitHub Pages

1. Merge to `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes only `index.html` and `assets/`. The large originals in `/photos` are not deployed.

The site will be at `https://<org>.github.io/hololand/`.

## Edit the content

- **Products / prices / descriptions:** `assets/data/products.json`. All prices, names and copy are **placeholders**; replace them with real ones.
- **WhatsApp number, socials, delivery text, city:** `assets/js/config.js`
- **New photos:** put the original in `/photos`, add a line in `scripts/optimize-images.py`, then run `pip install pillow && python3 scripts/optimize-images.py`.
- The story text and stats ("64 districts" etc.) are in `index.html`. Check they're accurate for the business.

## Turn on the Groq AI stylist

The stylist already works offline with a keyword matcher that understands English, Bangla and Banglish. To make it a real LLM:

A GitHub Pages site is public, so **the Groq key must never go in the site code**. A free Cloudflare Worker keeps it secret:

```bash
cd worker
npx wrangler login
npx wrangler secret put GROQ_API_KEY      # paste your key
# edit ALLOWED_ORIGINS and CATALOG_URL in wrangler.toml to your Pages URL
npx wrangler deploy
```

Put the printed URL (e.g. `https://hololand-stylist.<you>.workers.dev`) into `stylistEndpoint` in `assets/js/config.js`. The badge changes to **Live · Groq** and the mic starts using Groq Whisper, which understands spoken Bangla.

The Worker only accepts requests from your site's origin, trims history, caps output tokens, and only returns product IDs that exist in the catalogue. Models: `openai/gpt-oss-120b` for chat and `whisper-large-v3` for speech (change them in `wrangler.toml`).
