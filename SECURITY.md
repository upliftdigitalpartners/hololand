# Security notes

## How the site is protected

- **No secrets in the code.** The Groq key, admin password and GitHub token live only as Cloudflare Worker **secrets**. The repo and its whole history were scanned: no keys or tokens.
- **Admin** (`admin.html`) is just a login page. All power sits in the Worker, which:
  - checks the password with a timing-safe comparison and issues a signed 12-hour session (changing `ADMIN_TOKEN` signs everyone out);
  - rate-limits logins (5 attempts/minute per visitor via Cloudflare, plus 8 per 15 minutes per server);
  - only lets the admin write `assets/data/{products,faq,content,reviews,sizes}.json` and `assets/img/*.webp`, never code or workflows;
  - validates product data before publishing (IDs, prices, `#rrggbb` colours, photo names, text lengths).
- **The GitHub token** is fine-grained: this repo only, *Contents: read & write*. It can't change workflows or settings.
- **AI endpoints** accept requests only from hololandbd.com (and the github.io address), are rate-limited to 20 requests/minute per visitor, and are locked to store topics. They only return text and product IDs; they can't read or change anything.
- **Browser protections:** a Content-Security-Policy on every page (scripts only from this site; network calls only to the Worker and Open-Meteo), escaping of all shop data, and the admin refuses to load inside another site's frame.
- **No payments on the site.** Orders go to WhatsApp, so no card or bKash details ever pass through it.

## Owner checklist (do these once)

1. **Turn on two-factor authentication** for GitHub, Cloudflare, Groq and Squarespace. A stolen account password is the most realistic way someone could tamper with the site.
2. **Use a long, random `ADMIN_TOKEN`** (20+ characters, not reused anywhere).
3. **Set a spending limit in Groq** (console.groq.com → Settings → Billing / Limits), so abuse can never cost more than you're willing to spend.
4. **Verify hololandbd.com** in the GitHub organization (Settings → Pages → Add a domain) to prevent domain takeover.
5. **Renew the GitHub token** before it expires, then delete the old one.

## Things that are public by design

- The code, product data (including products marked *hidden*) and reviews in `assets/data/`. Don't put private notes in them.
- The original full-resolution photos in `/photos` (they aren't on the website, but anyone can download them from GitHub). To keep them private, move them out of the repo or make the repo private (GitHub Pages from a private repo needs a paid GitHub plan).
