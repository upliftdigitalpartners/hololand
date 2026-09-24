// Orders placed with the checkout form, stored in a SQLite-backed Durable Object.
// This holds customers' names, phones and addresses, so only the admin can read it.
import { DurableObject } from 'cloudflare:workers';
import { dayOf } from './stats.js';

export const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export class Orders extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, ts INTEGER NOT NULL, status TEXT NOT NULL,
      name TEXT, phone TEXT, area TEXT, address TEXT, payment TEXT, note TEXT, gift TEXT,
      items TEXT, subtotal INTEGER, delivery INTEGER, total INTEGER,
      admin_note TEXT, updated INTEGER)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS orders_ts ON orders(ts)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS counters (k TEXT PRIMARY KEY, n INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
  }

  async create(o) {
    // A double tap or a retry within 10 minutes returns the same order.
    const dup = this.sql.exec('SELECT id FROM orders WHERE phone = ? AND items = ? AND ts > ?', o.phone, o.items, o.ts - 600_000).toArray()[0];
    if (dup) return { id: dup.id, duplicate: true };
    const day = dayOf(o.ts);
    const prefix = `HL-${day.slice(2).replace(/-/g, '')}-`;
    // Per-day counter that only goes up, so a deleted order's number is never reused.
    let id;
    do {
      this.sql.exec('INSERT INTO counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1', prefix);
      const { n } = this.sql.exec('SELECT n FROM counters WHERE k = ?', prefix).toArray()[0];
      id = `${prefix}${String(n).padStart(3, '0')}`;
    } while (this.sql.exec('SELECT 1 FROM orders WHERE id = ?', id).toArray().length);
    this.sql.exec(
      `INSERT INTO orders (id, ts, status, name, phone, area, address, payment, note, gift, items, subtotal, delivery, total, updated)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, o.ts, 'new', o.name, o.phone, o.area, o.address, o.payment, o.note, o.gift, o.items, o.subtotal, o.delivery, o.total, o.ts,
    );
    return { id };
  }

  async list({ status = '', q = '', limit = 50, offset = 0 } = {}) {
    const where = [];
    const args = [];
    if (ORDER_STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
    if (q) {
      where.push('(id LIKE ? OR name LIKE ? OR phone LIKE ? OR address LIKE ?)');
      const like = `%${q.replace(/[%_]/g, '')}%`;
      args.push(like, like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = this.sql.exec(`SELECT * FROM orders ${w} ORDER BY ts DESC LIMIT ? OFFSET ?`, ...args, limit + 1, offset).toArray();
    const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    for (const r of this.sql.exec('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').toArray()) counts[r.status] = r.n;
    return {
      orders: rows.slice(0, limit).map((r) => ({ ...r, items: JSON.parse(r.items || '[]') })),
      more: rows.length > limit,
      counts,
    };
  }

  async update(id, { status, admin_note }, now = Date.now()) {
    const row = this.sql.exec('SELECT id FROM orders WHERE id = ?', id).toArray()[0];
    if (!row) return null;
    if (status !== undefined) this.sql.exec('UPDATE orders SET status = ?, updated = ? WHERE id = ?', status, now, id);
    if (admin_note !== undefined) this.sql.exec('UPDATE orders SET admin_note = ?, updated = ? WHERE id = ?', admin_note, now, id);
    return { ok: true };
  }

  /** Small settings store (e.g. which Telegram chats get order alerts). */
  async getKV(k) {
    const row = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0];
    return row ? JSON.parse(row.v) : null;
  }

  async setKV(k, v) {
    if (v == null) this.sql.exec('DELETE FROM kv WHERE k = ?', k);
    else this.sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v));
    return { ok: true };
  }

  async remove(id) {
    this.sql.exec('DELETE FROM orders WHERE id = ?', id);
    return { ok: true };
  }
}
