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
| AI studio: stylist chat + support bot (English / বাংলা, voice), photo colour match, gift finder with card message | Groq via a free Cloudflare Worker; every feature has an offline fallback |
| Size advisor in every product's quick view | Size chart + Groq |
| Reviews with AI summaries, FAQ section (with Google FAQ markup), floating "Ask Hololand" button | Vanilla JS |
| Owner tools (`admin.html`): product copy generator (EN/BN, SEO, Facebook, Instagram) and review summarizer | Groq, protected by an admin token |
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
3. The workflow in `.github/workflows/pages.yml` publishes only `index.html`, `admin.html` and `assets/`. The large originals in `/photos` are not deployed.

The site will be at `https://<org>.github.io/hololand/`.

## Edit the content

- **Products / prices / descriptions:** `assets/data/products.json`. All prices, names and copy are **placeholders**; replace them with real ones.
- **WhatsApp number, socials, delivery text, city:** `assets/js/config.js`
- **New photos:** put the original in `/photos`, add a line in `scripts/optimize-images.py`, then run `pip install pillow && python3 scripts/optimize-images.py`.
- The story text and stats ("64 districts" etc.) are in `index.html`. Check they're accurate for the business.

## Turn on the Groq AI

👉 **Follow [SETUP-GROQ.md](SETUP-GROQ.md)**, a click-by-click guide using only the browser (about 20 minutes, free).

In short: the Groq key lives in a free Cloudflare Worker (`worker/src/index.js`), never in the site. You then paste the Worker's address into `stylistEndpoint` in `assets/js/config.js`.

## Placeholder content to review

- `assets/data/products.json`: prices, names, descriptions
- `assets/data/faq.json`: delivery charges, times, exchange policy (**the support bot answers from this file**)
- `assets/data/sizes.json`: size chart measurements (the size advisor uses them)
- `assets/data/reviews.json`: empty on purpose; add only real reviews through `admin.html`
