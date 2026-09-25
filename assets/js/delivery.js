// Delivery date estimates and the Eid order-by banner.
// Settings come from admin → Texts & settings → Delivery (content.json → settings.delivery / settings.eid).
import { CONFIG } from './config.js';

const DAY = 86_400_000;
const BD = 6 * 3_600_000; // Bangladesh is UTC+6
const bdNow = () => new Date(Date.now() + BD); // read with getUTC* for Bangladesh wall-clock time
const ymd = (d) => d.toISOString().slice(0, 10);
export const fmtDay = (d) => d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

function range(v, def) {
  const m = String(v ?? '').match(/(\d+)\s*(?:[-–]\s*(\d+))?/);
  if (!m) return def;
  const a = +m[1], b = m[2] ? +m[2] : a;
  return [Math.min(a, b), Math.max(a, b)];
}

export function times() {
  const d = CONFIG.deliveryTimes || {};
  const cutoff = parseInt(d.cutoff, 10);
  return {
    inside: range(d.insideDays, [1, 2]),
    outside: range(d.outsideDays, [2, 4]),
    cutoff: Number.isFinite(cutoff) && cutoff >= 0 && cutoff <= 24 ? cutoff : 17,
    skipFri: d.skipFriday !== 'no',
  };
}

/** Adds n delivery days to a date, skipping Fridays if set. */
function addDays(date, n, skipFri) {
  const d = new Date(date);
  let left = n;
  while (left > 0) {
    d.setTime(d.getTime() + DAY);
    if (skipFri && d.getUTCDay() === 5) continue;
    left--;
  }
  return d;
}

/** { from, to } dates for an area ('inside' | 'outside'), for an order placed now. */
export function estimate(area) {
  const t = times();
  const now = bdNow();
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // After the cut-off hour (or on a closed Friday) the order is handled the next day.
  if (now.getUTCHours() >= t.cutoff) start = new Date(start.getTime() + DAY);
  while (t.skipFri && start.getUTCDay() === 5) start = new Date(start.getTime() + DAY);
  const [a, b] = t[area];
  return { from: addDays(start, a, t.skipFri), to: addDays(start, b, t.skipFri) };
}

const span = ({ from, to }) => (ymd(from) === ymd(to) ? `by ${fmtDay(to)}` : `${fmtDay(from)} – ${fmtDay(to)}`);

/** "Order now → Chittagong: by Sun 28 Sep · Other districts: Mon 29 Sep – Wed 1 Oct" */
export function deliveryLine() {
  const i = estimate('inside'), o = estimate('outside');
  return `🚚 Order now → Chittagong: by ${fmtDay(i.to)} · Other districts: ${span(o)}`;
}

export const areaEta = (area) => { const e = estimate(area); return `Estimated delivery: ${span(e)}`; };

/** The Eid banner text while the last order day hasn't passed, else ''. */
export function eidBanner() {
  const e = CONFIG.eid || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return '';
  const today = ymd(bdNow());
  if (today > e.date) return '';
  const last = new Date(`${e.date}T00:00:00Z`);
  const left = Math.round((last - new Date(`${today}T00:00:00Z`)) / DAY);
  const label = String(e.label || 'Eid').slice(0, 30);
  return `🌙 Order by ${fmtDay(last)} for delivery before ${label}${left === 0 ? ' (last day today!)' : left === 1 ? ' (1 day left)' : ` (${left} days left)`}`;
}
