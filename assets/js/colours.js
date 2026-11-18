// Colour families: the shop's colour filter and the search both group a product's swatch colour (hex)
// into one of these, so "red", "navy" or "cream" finds the right pieces whatever the colour is called.
export const FAMILIES = { neutral: ['Neutrals', '#e9e4da'], dark: ['Black & charcoal', '#222'], red: ['Red & pink', '#b8344f'], warm: ['Mustard & sand', '#c8861f'], green: ['Green', '#2f5a3c'], blue: ['Blue', '#1f5a8a'], purple: ['Purple & lilac', '#8f6aa6'] };

export function family(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (l < 0.22 && s < 0.35) return 'dark';
  if (s < 0.22 || l > 0.86) return 'neutral';
  if (h < 20 || h >= 330) return 'red';
  if (h < 65) return l > 0.7 ? 'neutral' : 'warm';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  return 'purple';
}

/** Everyday words people search with, per family. */
export const FAMILY_WORDS = {
  neutral: 'neutral white off-white cream ivory beige stone',
  dark: 'black charcoal dark grey gray',
  red: 'red pink maroon rose burgundy wine',
  warm: 'mustard sand yellow gold brown tan orange camel',
  green: 'green olive emerald bottle',
  blue: 'blue navy sky cobalt teal',
  purple: 'purple lilac violet lavender plum',
};
