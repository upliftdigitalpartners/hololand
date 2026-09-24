// Anonymous, cookie-free site stats stored in a SQLite-backed Durable Object.
// No IP addresses or personal data are stored: a visitor is a daily-rotating
// hash of (day, IP, browser, secret), so nobody can be followed across days.
import { DurableObject } from 'cloudflare:workers';

export const EVENT_TYPES = ['view', 'bag', 'order', 'chat'];
const DAY_MS = 86_400_000;
const TZ_OFFSET = 6 * 3_600_000; // Bangladesh (UTC+6): days roll over at local midnight

export const dayOf = (ts) => new Date(ts + TZ_OFFSET).toISOString().slice(0, 10);

export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events (
      ts INTEGER NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL, path TEXT, product TEXT,
      ref TEXT, device TEXT, city TEXT, country TEXT, vid TEXT, value INTEGER)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS events_day ON events(day)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS events_ts ON events(ts)');
  }

  async record(e) {
    this.sql.exec(
      'INSERT INTO events (ts, day, type, path, product, ref, device, city, country, vid, value) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      e.ts, dayOf(e.ts), e.type, e.path, e.product, e.ref, e.device, e.city, e.country, e.vid, e.value,
    );
    // Keep about 13 months.
    if (Math.random() < 0.01) this.sql.exec('DELETE FROM events WHERE ts < ?', e.ts - 400 * DAY_MS);
  }

  async report(days, now = Date.now()) {
    const since = dayOf(now - (days - 1) * DAY_MS);
    const all = (q, ...b) => this.sql.exec(q, ...b).toArray();
    const one = (q, ...b) => all(q, ...b)[0] || {};

    const daily = all(`SELECT day,
        COUNT(DISTINCT CASE WHEN type='view' THEN vid END) AS visitors,
        SUM(type='view') AS views, SUM(type='bag') AS bag, SUM(type='order') AS orders, SUM(type='chat') AS chats
      FROM events WHERE day >= ? GROUP BY day ORDER BY day`, since);
    // Fill empty days so the chart has no gaps.
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = dayOf(now - i * DAY_MS);
      series.push(byDay.get(day) || { day, visitors: 0, views: 0, bag: 0, orders: 0, chats: 0 });
    }
    const sum = (k) => series.reduce((a, d) => a + (d[k] || 0), 0);
    const top = (col, type = 'view', limit = 8) => all(
      `SELECT ${col} AS name, COUNT(*) AS n, COUNT(DISTINCT day || vid) AS visitors FROM events
       WHERE day >= ? AND type = ? AND ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY n DESC LIMIT ?`, since, type, limit);

    return {
      days, since, series,
      totals: {
        visitors: sum('visitors'), views: sum('views'), bag: sum('bag'), orders: sum('orders'), chats: sum('chats'),
        orderValue: one("SELECT COALESCE(SUM(value),0) AS v FROM events WHERE day >= ? AND type='order'", since).v || 0,
        live: one("SELECT COUNT(DISTINCT vid) AS n FROM events WHERE ts > ? AND type='view'", now - 5 * 60_000).n || 0,
      },
      products: top('product'),
      bagProducts: top('product', 'bag'),
      pages: top('path'),
      referrers: top('ref'),
      devices: top('device'),
      cities: top('city'),
    };
  }
}
