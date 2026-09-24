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

## Step 3: Create the Cloudflare Worker

1. Go to **https://dash.cloudflare.com** and sign up (free). You don't need a domain.
2. In the left menu open **Workers & Pages** (sometimes under *Compute*). Click **Create** → **Create Worker** (or "Start with Hello World").
3. Name it **`hololand-ai`** and click **Deploy**.
4. Click **Edit code**. In the editor:
   - Select everything in the file and delete it.
   - In another tab, open this file in your GitHub repo: **`worker/src/index.js`** → click **Raw** → select all → copy.
   - Paste it into the Cloudflare editor.
   - Click **Deploy**.
5. Note your Worker's address, shown at the top. It looks like
   **`https://hololand-ai.YOUR-NAME.workers.dev`**.

## Step 4: Give the Worker its settings

In Cloudflare, open the Worker → **Settings → Variables and Secrets** → **Add**. Add these three:

| Type | Name | Value |
|---|---|---|
| **Secret** | `GROQ_API_KEY` | your `gsk_…` key from Step 2 |
| **Secret** | `ADMIN_TOKEN` | a long password you make up, e.g. `hololand-studio-7f3k9q2m` (used only for the owner tools) |
| **Text** | `SITE_URL` | `https://upliftdigitalpartners.github.io/hololand` (no `/` at the end) |

Click **Deploy** / **Save**.

**Check it:** open your Worker address in a browser. You should see:

```json
{"ok":true,"groqKey":true,"siteUrl":"https://upliftdigitalpartners.github.io/hololand","adminTools":true}
```

`groqKey:false` means the key wasn't saved; redo Step 4.

## Step 5: Connect the website to the Worker

1. In your GitHub repo open **`assets/js/config.js`** and click the ✏️ pencil (edit).
2. Find `stylistEndpoint: '',` and put your Worker address between the quotes:
   ```js
   stylistEndpoint: 'https://hololand-ai.YOUR-NAME.workers.dev',
   ```
3. Click **Commit changes**. Wait 1–2 minutes for the Actions tab to go green.
4. Open the site and scroll to **AI Stylist**. The badge should now say **● Live · Groq** (green dot).

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
| Badge still says "Offline matcher" | `config.js` wasn't updated, or the site hasn't redeployed yet. Hard-refresh the page (Ctrl+Shift+R). |
| AI answers look generic / the stylist ignores the question | Open the Worker address: `groqKey` must be `true`. Check the key in Groq isn't deleted. |
| Browser console shows `403 origin not allowed` | `SITE_URL` is wrong. It must be exactly `https://upliftdigitalpartners.github.io/hololand`. Using a custom domain later? Add a Text variable `ALLOWED_ORIGINS` = `https://yourdomain.com`. |
| Photo match shows colours but no "✦ AI" note | Groq's vision model name changes over time. In Groq's console check **Models** for one marked *vision*, and set a Text variable `VISION_MODEL` to its ID. The colour matching still works without it. |
| "slow down" errors | Built-in limit of 30 AI requests per minute per visitor, to protect your Groq quota. |
| Admin page says "Wrong or missing admin token" | Paste `ADMIN_TOKEN` exactly as you saved it in Cloudflare. |
| You changed `worker/src/index.js` in GitHub | Cloudflare doesn't update by itself: repeat Step 3.4 (paste the new code → Deploy). |

**Models used** (change them with Text variables, no code edits): `CHAT_MODEL` = `openai/gpt-oss-120b`, `STT_MODEL` = `whisper-large-v3`, `VISION_MODEL` = `qwen/qwen3.6-27b`.
