# Turning on the Groq AI: step by step

**Time:** about 20 minutes. **Cost:** free (Groq free tier + Cloudflare free plan). **Needed:** a web browser; no coding or command line.

## Why there's an extra step

Your website on GitHub Pages is public: anyone can read its code. If the Groq key were in the site, anyone could copy it and use your account. So we put a tiny "middleman" program (a **Cloudflare Worker**) between the site and Groq. The Worker keeps the key secret:

```
Customer's browser  →  your Worker (holds the Groq key)  →  Groq
```

Until you finish this guide the site still works: every AI feature has a built-in non-AI fallback.

---

## Step 1: Put the website live first

The Worker reads your product list from the live site, so the site has to be live first.

1. Merge the website branch into `main` on GitHub.
2. In the repo, go to **Settings → Pages**. Under *Build and deployment → Source*, choose **GitHub Actions**.
3. Open the **Actions** tab and wait for "Deploy to GitHub Pages" to get a green tick (1–2 minutes).
4. Your site is now at **https://upliftdigitalpartners.github.io/hololand/**. Open it to check.

## Step 2: Get your Groq API key

1. Go to **https://console.groq.com** and sign in.
2. Click **API Keys → Create API Key**. Name it `hololand-website`.
3. Copy the key. It starts with `gsk_`. Paste it somewhere safe for a few minutes.
   Don't put it in GitHub, email or chat. If it ever leaks, delete it in Groq and make a new one.

## Step 3: Create the Cloudflare Worker (connected to GitHub)

1. Go to **https://dash.cloudflare.com** and sign up (free). You don't need a domain.
2. Open **Workers & Pages → Create → Import a repository**. Pick **upliftdigitalpartners/hololand**, name the Worker **`hololand`**, keep the default build settings, and click **Deploy**.
3. Cloudflare reads `wrangler.toml` at the top of the repo and deploys `worker/src/index.js`. It redeploys by itself on every push to `main`, so you never paste code.
4. Your Worker's address is **`https://hololand.upliftdigitalpartners.workers.dev`**. It's already set in `assets/js/config.js`.

> Named the Worker something other than `hololand`? Change `name = "hololand"` in `wrangler.toml` to match, and update the address in `config.js`.

## Step 4: Add your two secrets

In Cloudflare, open the **hololand** Worker → **Settings → Variables and Secrets** → **Add**:

| Type | Name | Value |
|---|---|---|
| **Secret** | `GROQ_API_KEY` | your `gsk_…` key from Step 2 |
| **Secret** | `ADMIN_TOKEN` | a long password you make up, e.g. `hololand-studio-7f3k9q2m` (used only for the owner tools) |

Click **Deploy** / **Save**. The other settings (`SITE_URL`, model names) come from `wrangler.toml`; change them there, not in the dashboard.

**Check it:** open **https://hololand.upliftdigitalpartners.workers.dev** in a browser. You should see:

```json
{"ok":true,"groqKey":true,"siteUrl":"https://upliftdigitalpartners.github.io/hololand","adminTools":true}
```

`groqKey:false` means the key wasn't saved; redo Step 4.

## Step 5: Try it on the site

Open the site and scroll to **AI Stylist**. The badge says **● Live · Groq**.

**Try it:**
- **Chat:** "Eid outfit for my husband under 4000", or "ডেলিভারি চার্জ কত?"
- **Mic 🎤:** speak in Bangla or English (Groq Whisper).
- **Photo match:** upload an outfit photo.
- **Gift finder:** answer 4 taps; it writes a card in English + বাংলা.
- **Find my size:** open any product → "Find my size ✦".

## Step 6: Owner tools (product copy + review summaries)

Open **https://upliftdigitalpartners.github.io/hololand/admin.html** (not linked from the site, and hidden from Google).

1. Paste your Worker address and your `ADMIN_TOKEN` → **Test connection**. You should see "Connected ✓".
2. **Product copy:** pick a product (or *All products*) → **Generate**. You get English + Bangla descriptions, an SEO title and description, a Facebook post, and an Instagram caption with hashtags. Use the *Copy* buttons for social media.
   To use the new descriptions on the site: **Download products.json** → in GitHub open `assets/data/` → **Add file → Upload files** → drop it in → **Commit**.
3. **Review summaries:** pick a product and paste real reviews, one per line (`Name | 5 | text`), then click **Add & summarise**. Repeat for other products, then **Download reviews.json** and upload it to `assets/data/` the same way. Stars and "What customers say" appear on those products.

---

## If something doesn't work

| What you see | Fix |
|---|---|
| Worker shows **Latest build failed** | Open **Deployments → View build log**. The most common cause is a Worker name that doesn't match `name` in `wrangler.toml`. |
| Worker page says **No URLs enabled** / address doesn't open | Wait for a successful build (`wrangler.toml` turns on the workers.dev address), or enable it under **Settings → Domains & Routes → workers.dev**. |
| Badge still says "Offline matcher" | The site hasn't redeployed yet. Hard-refresh the page (Ctrl+Shift+R). |
| AI answers look generic / the stylist ignores the question | Open the Worker address: `groqKey` must be `true`. Check the key in Groq isn't deleted. |
| Browser console shows `403 origin not allowed` | `SITE_URL` in `wrangler.toml` is wrong. It must be exactly `https://upliftdigitalpartners.github.io/hololand`. Using a custom domain later? Add `ALLOWED_ORIGINS = "https://yourdomain.com"` under `[vars]` in `wrangler.toml`. |
| Photo match shows colours but no "✦ AI" note | Groq's vision model name changes over time. In Groq's console check **Models** for one marked *vision*, and set `VISION_MODEL` in `wrangler.toml` to its ID. The colour matching still works without it. |
| "slow down" errors | Built-in limit of 30 AI requests per minute per visitor, to protect your Groq quota. |
| Admin page says "Wrong or missing admin token" | Paste `ADMIN_TOKEN` exactly as you saved it in Cloudflare. |

**Models used** (change them in `wrangler.toml`): `CHAT_MODEL` = `openai/gpt-oss-120b`, `STT_MODEL` = `whisper-large-v3`, `VISION_MODEL` = `qwen/qwen3.6-27b`.
