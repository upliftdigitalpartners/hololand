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

Open the site and scroll to **AI Stylist**. The badge says **● Online** (green dot).

**Try it:**
- **Chat:** "Eid outfit for my husband under 4000", or "ডেলিভারি চার্জ কত?"
- **Mic 🎤:** speak in Bangla or English (Groq Whisper).
- **Photo match:** upload an outfit photo.
- **Gift finder:** answer 4 taps; it writes a card in English + বাংলা.
- **Find my size:** open any product → "Find my size ✦".

## Step 6: Admin login (edit prices, products, texts)

The admin page lets you change prices, descriptions and site texts, add products with photos, hide sold-out items and edit the FAQ, all without touching code. Clicking **Publish** saves your changes to GitHub, and the site updates about a minute later.

**Where it is:** click the small **©** at the bottom of the website, or go to **https://hololandbd.com/admin.html**. It isn't linked anywhere else and is hidden from Google.

**Password:** your `ADMIN_TOKEN` from Step 4. Change it any time in Cloudflare; everyone gets signed out.

### 6a. Let the Worker save to GitHub (one time)

Publish needs a GitHub token that can only edit this one repository:

1. On GitHub, click your profile photo → **Settings** → **Developer settings** (bottom of the left menu) → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Fill in:
   - **Token name:** `hololand-admin`
   - **Expiration:** 1 year (put a reminder in your calendar to renew it)
   - **Resource owner:** `upliftdigitalpartners`
   - **Repository access:** *Only select repositories* → **hololand**
   - **Permissions → Repository permissions → Contents:** **Read and write** (leave everything else as is)
3. Click **Generate token** and copy it (it starts with `github_pat_`).
   If GitHub says the organization must approve it, an owner of `upliftdigitalpartners` approves it under the organization's **Settings → Personal access tokens → Pending requests**.
4. In Cloudflare: **hololand → Settings → Variables and Secrets** → **+ Add** → **Type: Secret**, **Name:** `GITHUB_TOKEN`, **Value:** the token → **Deploy**.

> ⚠️ Use the **Variables and Secrets** section near the **top** of Settings, **not** the one inside **Builds** further down. Build variables are invisible to the running Worker.

**Check it:** open https://hololand.upliftdigitalpartners.workers.dev. It should show `"publishing": true`.

### 6b. Using the admin

- **Orders:** every order placed with the website's checkout form appears here, newest first, with the customer's name, phone, address, items and total (delivery included). Change the status (New → Confirmed → Shipped → Delivered, or Cancelled), tap **WhatsApp customer** to send a ready-made confirmation message, **Copy details** for the courier, and add private notes. The tab shows how many orders are **New** and checks for new ones every minute while it's open. Delivery charges are set under **Texts & settings → Delivery charges**.
- **Products:** change prices right in the list, untick **Shown** to hide an item, or click **Edit** for everything else: name, colour, tags, English/বাংলা descriptions, photos (upload, reorder, remove). **✦ Write with AI** fills in the descriptions and also gives you a Facebook post, an Instagram caption and SEO text to copy. **+ New product** adds one.
- **Stock:** open a product (**Products → Edit**) and type how many you have of each size under **Stock per size**, then **Save stock**. It's live in seconds, with no Publish. Every order takes stock automatically; at 0 the size is crossed out on the site, and when every size is 0 the product shows **Sold out**. Cancelling or deleting an order puts its stock back. Sizes left empty are unlimited (not tracked). Customers see “Only 2 left” when 3 or fewer remain.
- **Categories:** add a category (e.g. *Men · Shirt*, *Women · Saree*, *Kids · Panjabi*), pick its **Section** (Men, Women, Kids or Everyone), and type its sizes (e.g. `S, M, L, XL`, `2Y, 4Y, 6Y` or `Free size`). Each category gets its own tab in the shop, a card on the home page, and its sizes on product pages; the header shows one link per section. Then put products in it from **Products → Edit → Category**. A category can only be deleted once it has no products. **Find my size** only appears for categories with a measurement chart (Men · Panjabi and Women · Knitwear).
- **Texts & settings:** the announcement bar (e.g. "Eid sale: 15% off"), WhatsApp number, store address, opening hours, Google Maps link, social links, and the homepage and story texts.
- **FAQ:** the answers the chat assistant uses for delivery, payment and store questions.
- **Reviews:** paste real customer reviews; the AI writes a summary, and stars appear on the product.
- **Stats:** visitors per day, who's on the site right now, most viewed and most bagged products, where visitors come from (Facebook, Instagram, Google…), phones vs computers, and cities. Pick Today, 7, 30 or 90 days. Counting is anonymous (no cookies, no IP addresses stored). It starts working by itself once the Worker redeploys; nothing to set up.
- Nothing goes live until you click **Publish**. The button shows how many things changed.

---

## Step 7: Order alerts on your phone (Telegram, optional)

Every new order can be sent to Telegram, so you hear about it even when the admin is closed. It's free.

**Once, by whoever manages Cloudflare:**
1. In Telegram, open **@BotFather**, send `/newbot`, and pick a name (e.g. *Hololand Orders*) and a username ending in `bot` (e.g. `HololandOrdersBot`).
2. BotFather replies with a token like `123456789:AAH…`. Keep it private.
3. Cloudflare → **Workers & Pages → hololand → Settings → Variables and Secrets** (the top section, not Build) → **Add** → type **Secret**, name `TELEGRAM_BOT_TOKEN`, value = the token → **Deploy**.
4. Check: opening the Worker address shows `"telegram": true`.

**Then, from the admin (no Cloudflare needed):**
1. Admin → **Orders** → **📣 Phone alerts** → **+ Connect a phone**.
2. Tap **Open @YourBot in Telegram**, then tap **Start** in Telegram.
3. Back in the admin, tap **I tapped Start**. Telegram says “✅ Hololand order alerts are on”.
4. Tap **Send a test alert** to check. To add a staff member, send them the link from step 2 (it works for 15 minutes). **Remove** stops alerts to a phone.

Each alert has the order number, customer name, phone, address, items and total, and an **Open orders** button.

---

## If something doesn't work

| What you see | Fix |
|---|---|
| Worker shows **Latest build failed** | Open **Deployments → View build log**. The most common cause is a Worker name that doesn't match `name` in `wrangler.toml`. |
| Worker page says **No URLs enabled** / address doesn't open | Wait for a successful build (`wrangler.toml` turns on the workers.dev address), or enable it under **Settings → Domains & Routes → workers.dev**. |
| Badge still says "Offline matcher" | The site hasn't redeployed yet. Hard-refresh the page (Ctrl+Shift+R). |
| AI answers look generic / the stylist ignores the question | Open the Worker address: `groqKey` must be `true`. Check the key in Groq isn't deleted. |
| Browser console shows `403 origin not allowed` | The site's address isn't in `ALLOWED_ORIGINS` in `wrangler.toml` (currently hololandbd.com and www.hololandbd.com). Add any new domain there. |
| Photo match shows colours but no "✦ AI" note | Groq's vision model name changes over time. In Groq's console check **Models** for one marked *vision*, and set `VISION_MODEL` in `wrangler.toml` to its ID. The colour matching still works without it. |
| "slow down" errors | Built-in limit of 30 AI requests per minute per visitor, to protect your Groq quota. |
| Admin login says "Wrong password" | Type `ADMIN_TOKEN` exactly as saved in Cloudflare. After 8 wrong tries, wait 15 minutes. |
| Publish fails with "Publishing is not set up" | Add `GITHUB_TOKEN` (Step 6a) in the top **Variables and Secrets** section, not in Builds. |
| Publish fails with "GitHub 401/403/404" | The token expired or can't write to the repo: make a new one with **Contents: Read and write** on **hololand**. If `main` has branch protection that requires pull requests, allow the token or turn that rule off. |
| Secrets added but the Worker says `false` | They were added under **Builds**. Add them again in the top **Variables and Secrets** section. |

**Models used** (change them in `wrangler.toml`): `CHAT_MODEL` = `openai/gpt-oss-120b`, `STT_MODEL` = `whisper-large-v3`, `VISION_MODEL` = `qwen/qwen3.6-27b`.
