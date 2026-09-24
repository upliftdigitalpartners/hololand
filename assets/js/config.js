// Site-wide settings. Edit these, commit, and GitHub Pages redeploys.
export const CONFIG = {
  brand: 'Hololand',

  // Orders are sent as a pre-filled WhatsApp message (no backend needed).
  // International format, digits only, e.g. '8801712345678'.
  whatsappNumber: '8801000000000',

  // URL of the Cloudflare Worker (worker/ + wrangler.toml) that holds your Groq key.
  // Set to '' to run every AI feature in offline mode instead.
  stylistEndpoint: 'https://hololand.upliftdigitalpartners.workers.dev',

  currency: '৳',
  deliveryNote: 'Cash on delivery & bKash · Delivery across all 64 districts',

  // Weather for the stylist + nav chip (Open-Meteo, free, no key).
  city: { name: 'Dhaka', lat: 23.8103, lon: 90.4125 },

  socials: {
    facebook: 'https://facebook.com/',
    instagram: 'https://instagram.com/',
    tiktok: 'https://tiktok.com/',
  },
};
