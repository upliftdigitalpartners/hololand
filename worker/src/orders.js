// Orders placed with the checkout form, stored in a SQLite-backed Durable Object.
// This holds customers' names, phones and addresses, so only the admin can read it.
import { DurableObject } from 'cloudflare:workers';
import { dayOf } from './stats.js';

export const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'];
// Orders in these states hold no stock and no promo use ('returned' = parcel refused / sent back).
const OFF = new Set(['cancelled', 'returned']);
const RETURNED_SQL = "(status = 'returned' OR courier_status IN ('cancelled', 'cancelled_approval_pending'))";

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
    // Stock per product size. A size with no row is not tracked (always available).
    this.sql.exec('CREATE TABLE IF NOT EXISTS stock (product TEXT NOT NULL, size TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY (product, size))');
    // What each order took from stock, so cancelling or deleting it can put it back.
    // Later columns: promo code + discount, and courier booking details.
    for (const col of ['stock_taken TEXT', 'promo TEXT', 'discount INTEGER', 'courier TEXT', 'consignment_id TEXT', 'tracking_code TEXT', 'courier_status TEXT', 'courier_at INTEGER']) {
      try { this.sql.exec(`ALTER TABLE orders ADD COLUMN ${col}`); } catch { /* already there */ }
    }
    this.sql.exec(`CREATE TABLE IF NOT EXISTS promos (
      code TEXT PRIMARY KEY, type TEXT NOT NULL, value INTEGER NOT NULL, min_total INTEGER NOT NULL DEFAULT 0,
      expires TEXT, max_uses INTEGER, uses INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created INTEGER)`);
  }

  async create(o) {
    // A double tap or a retry within 10 minutes returns the same order.
    const dup = this.sql.exec('SELECT id FROM orders WHERE phone = ? AND items = ? AND ts > ?', o.phone, o.items, o.ts - 600_000).toArray()[0];
    if (dup) return { id: dup.id, duplicate: true };
    // Numbers the admin flagged: blocked, or allowed only with bKash advance payment.
    const flag = ((await this.getKV('phone_flags')) || {})[o.phone];
    if (flag === 'block') return { blocked: true };
    if (flag === 'advance' && o.payment !== 'bkash') return { needAdvance: true };
    // Fake orders shouldn't be able to lock up stock: a phone can have at most 3 orders waiting for confirmation.
    const open = this.sql.exec("SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND status = 'new'", o.phone).toArray()[0].n;
    if (open >= 3) return { tooMany: true };
    // Check and take stock in one go (a Durable Object runs one request at a time,
    // so two customers can never both buy the last piece).
    const items = JSON.parse(o.items);
    const short = this.shortages(items);
    if (short.length) return { soldOut: short };
    // Promo code: checked and counted here too, so a limited code can't be over-used.
    let discount = 0;
    if (o.promo) {
      const p = this.promoCheck(o.promo, o.subtotal, o.ts);
      if (!p.ok) return { promoError: p.message };
      discount = p.discount;
    }
    const total = o.subtotal - discount + o.delivery;
    const taken = this.take(items);
    if (o.promo) this.sql.exec('UPDATE promos SET uses = uses + 1 WHERE code = ?', o.promo);
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
      `INSERT INTO orders (id, ts, status, name, phone, area, address, payment, note, gift, items, subtotal, delivery, total, updated, stock_taken, promo, discount)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, o.ts, 'new', o.name, o.phone, o.area, o.address, o.payment, o.note, o.gift, o.items, o.subtotal, o.delivery, total, o.ts, JSON.stringify(taken), o.promo || null, discount,
    );
    return { id, discount, total };
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
    const page = rows.slice(0, limit);
    return {
      orders: page.map((r) => ({ ...r, items: JSON.parse(r.items || '[]') })),
      more: rows.length > limit,
      counts,
      history: this.phoneHistory([...new Set(page.map((r) => r.phone))]),
      flags: (await this.getKV('phone_flags')) || {},
    };
  }

  async update(id, { status, admin_note }, now = Date.now()) {
    const row = this.sql.exec('SELECT id, status, items, stock_taken, promo FROM orders WHERE id = ?', id).toArray()[0];
    if (!row) return null;
    if (status !== undefined && status !== row.status) {
      // Cancelling puts the stock (and the promo code use) back; un-cancelling takes them again.
      let taken = JSON.parse(row.stock_taken || '[]');
      if (OFF.has(status) && !OFF.has(row.status)) { this.put(taken); taken = []; this.promoUse(row.promo, -1); }
      else if (OFF.has(row.status) && !OFF.has(status)) { taken = this.take(JSON.parse(row.items || '[]'), true); this.promoUse(row.promo, 1); }
      this.sql.exec('UPDATE orders SET status = ?, stock_taken = ?, updated = ? WHERE id = ?', status, JSON.stringify(taken), now, id);
    }
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
    const row = this.sql.exec('SELECT stock_taken, status, promo FROM orders WHERE id = ?', id).toArray()[0];
    if (row) this.put(JSON.parse(row.stock_taken || '[]')); // e.g. a test order
    if (row && !OFF.has(row.status)) this.promoUse(row.promo, -1);
    this.sql.exec('DELETE FROM orders WHERE id = ?', id);
    return { ok: true };
  }

  /* ---- customer history (risky customers) ---- */
  /** { phone: { orders, delivered, returned, cancelled, open } } over all past orders. */
  phoneHistory(phones) {
    const out = {};
    if (!phones.length) return out;
    const rows = this.sql.exec(`SELECT phone, COUNT(*) AS orders,
        SUM(status = 'delivered') AS delivered,
        SUM(${RETURNED_SQL}) AS returned,
        SUM(status = 'cancelled' AND NOT ${RETURNED_SQL}) AS cancelled,
        SUM(status IN ('new', 'confirmed', 'shipped')) AS open
      FROM orders WHERE phone IN (${phones.map(() => '?').join(',')}) GROUP BY phone`, ...phones).toArray();
    for (const r of rows) out[r.phone] = { orders: r.orders, delivered: r.delivered, returned: r.returned, cancelled: r.cancelled, open: r.open };
    return out;
  }

  async historyFor(phone) { return this.phoneHistory([phone])[phone] || { orders: 0, delivered: 0, returned: 0, cancelled: 0, open: 0 }; }

  async setPhoneFlag(phone, mode) {
    const flags = (await this.getKV('phone_flags')) || {};
    if (mode === 'block' || mode === 'advance') flags[phone] = mode; else delete flags[phone];
    await this.setKV('phone_flags', flags);
    return flags;
  }

  /* ---- sales report ---- */
  async salesReport(days, now = Date.now()) {
    const since = dayOf(now - (days - 1) * 86_400_000);
    const rows = this.sql.exec('SELECT * FROM orders WHERE ts >= ? ORDER BY ts', now - (days + 1) * 86_400_000).toArray()
      .filter((r) => dayOf(r.ts) >= since);
    const live = rows.filter((r) => !OFF.has(r.status));
    const sum = (list, k) => list.reduce((n, r) => n + (r[k] || 0), 0);
    const byDay = new Map();
    for (let i = days - 1; i >= 0; i--) byDay.set(dayOf(now - i * 86_400_000), { orders: 0, revenue: 0 });
    for (const r of live) { const d = byDay.get(dayOf(r.ts)); if (d) { d.orders++; d.revenue += r.total; } }
    const products = new Map(), sizes = new Map(), pay = { cod: { orders: 0, revenue: 0 }, bkash: { orders: 0, revenue: 0 } }, promos = new Map();
    for (const r of live) {
      for (const l of JSON.parse(r.items || '[]')) {
        const p = products.get(l.id) || { id: l.id, name: l.name, code: l.code, units: 0, revenue: 0 };
        p.units += l.qty; p.revenue += l.price * l.qty; products.set(l.id, p);
        sizes.set(l.size, (sizes.get(l.size) || 0) + l.qty);
      }
      const pm = pay[r.payment === 'bkash' ? 'bkash' : 'cod']; pm.orders++; pm.revenue += r.total;
      if (r.promo) { const x = promos.get(r.promo) || { code: r.promo, orders: 0, discount: 0 }; x.orders++; x.discount += r.discount || 0; promos.set(r.promo, x); }
    }
    const status = Object.fromEntries(ORDER_STATUSES.map((st) => [st, rows.filter((r) => r.status === st).length]));
    return {
      days, since,
      totals: {
        orders: live.length, revenue: sum(live, 'total'), items: sum(live, 'subtotal') - sum(live, 'discount'),
        delivery: sum(live, 'delivery'), discount: sum(live, 'discount'),
        delivered: sum(rows.filter((r) => r.status === 'delivered'), 'total'),
        avg: live.length ? Math.round(sum(live, 'total') / live.length) : 0,
        all: rows.length,
      },
      status,
      series: [...byDay].map(([day, d]) => ({ day, ...d })),
      products: [...products.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 8),
      sizes: [...sizes].map(([size, units]) => ({ size, units })).sort((a, b) => b.units - a.units).slice(0, 8),
      payment: pay,
      promos: [...promos.values()].sort((a, b) => b.orders - a.orders),
    };
  }

  /* ---- promo codes ---- */
  promoUse(code, d) {
    if (code) this.sql.exec('UPDATE promos SET uses = MAX(0, uses + ?) WHERE code = ?', d, code);
  }

  /** Is a code usable for this subtotal right now? { ok, discount, message, promo } */
  promoCheck(code, subtotal, now = Date.now()) {
    const p = this.sql.exec('SELECT * FROM promos WHERE code = ?', code).toArray()[0];
    if (!p || !p.active) return { ok: false, message: 'That promo code isn’t valid.' };
    if (p.expires && dayOf(now) > p.expires) return { ok: false, message: 'That promo code has expired.' };
    if (p.max_uses && p.uses >= p.max_uses) return { ok: false, message: 'That promo code has been fully used.' };
    if (subtotal < p.min_total) return { ok: false, message: `This code needs an order of at least ৳${p.min_total.toLocaleString('en-IN')}.` };
    const discount = p.type === 'percent' ? Math.round((subtotal * p.value) / 100) : Math.min(p.value, subtotal);
    return { ok: true, discount, promo: { code: p.code, type: p.type, value: p.value } };
  }

  async checkPromo(code, subtotal) { return this.promoCheck(code, subtotal); }

  async listPromos() {
    return this.sql.exec('SELECT * FROM promos ORDER BY created DESC').toArray().map((p) => ({ ...p, active: !!p.active }));
  }

  async savePromo(p, now = Date.now()) {
    this.sql.exec(
      `INSERT INTO promos (code, type, value, min_total, expires, max_uses, active, created) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(code) DO UPDATE SET type = excluded.type, value = excluded.value, min_total = excluded.min_total,
         expires = excluded.expires, max_uses = excluded.max_uses, active = excluded.active`,
      p.code, p.type, p.value, p.min_total, p.expires, p.max_uses, p.active ? 1 : 0, now,
    );
    return this.listPromos();
  }

  async deletePromo(code) {
    this.sql.exec('DELETE FROM promos WHERE code = ?', code);
    return this.listPromos();
  }

  /* ---- courier + tracking ---- */
  async getOrder(id) {
    const r = this.sql.exec('SELECT * FROM orders WHERE id = ?', id).toArray()[0];
    return r ? { ...r, items: JSON.parse(r.items || '[]') } : null;
  }

  async setCourier(id, f, now = Date.now()) {
    const cur = this.sql.exec('SELECT status FROM orders WHERE id = ?', id).toArray()[0];
    if (!cur) return null;
    this.sql.exec(
      `UPDATE orders SET courier = COALESCE(?, courier), consignment_id = COALESCE(?, consignment_id), tracking_code = COALESCE(?, tracking_code),
         courier_status = COALESCE(?, courier_status), courier_at = ?, updated = ? WHERE id = ?`,
      f.courier ?? null, f.consignment_id ?? null, f.tracking_code ?? null, f.courier_status ?? null, now, now, id,
    );
    // Booking a parcel marks the order shipped; the courier saying "delivered" marks it delivered.
    const next = f.status || null;
    if (next && next !== cur.status && !OFF.has(cur.status)) this.sql.exec('UPDATE orders SET status = ? WHERE id = ?', next, id);
    return this.getOrder(id);
  }

  /** Orders with a parcel that isn't finished yet (for the hourly courier check). */
  async activeParcels(limit = 40) {
    return this.sql.exec(`SELECT id, consignment_id, courier_status FROM orders WHERE consignment_id IS NOT NULL
      AND status = 'shipped' ORDER BY courier_at ASC LIMIT ?`, limit).toArray();
  }

  /** What a customer may see about their own order (order number + phone must both match). */
  async publicStatus(id, phone) {
    const r = this.sql.exec('SELECT * FROM orders WHERE id = ? AND phone = ?', id, phone).toArray()[0];
    if (!r) return null;
    return {
      id: r.id, placed: r.ts, status: r.status, updated: r.updated, area: r.area, payment: r.payment,
      items: JSON.parse(r.items || '[]').map((l) => ({ name: l.name, size: l.size, qty: l.qty, price: l.price })),
      subtotal: r.subtotal, discount: r.discount || 0, delivery: r.delivery, total: r.total,
      courier: r.courier, tracking_code: r.tracking_code, courier_status: r.courier_status,
    };
  }

  /* ---- stock ---- */
  qtyOf(product, size) {
    const row = this.sql.exec('SELECT qty FROM stock WHERE product = ? AND size = ?', product, size).toArray()[0];
    return row ? row.qty : null; // null = not tracked
  }

  /** Items that need more than is left: [{ id, name, size, left }]. */
  shortages(items) {
    const need = new Map();
    for (const l of items) need.set(`${l.id}|${l.size}`, { l, n: (need.get(`${l.id}|${l.size}`)?.n || 0) + l.qty });
    const out = [];
    for (const { l, n } of need.values()) {
      const left = this.qtyOf(l.id, l.size);
      if (left !== null && left < n) out.push({ id: l.id, name: l.name, size: l.size, left: Math.max(0, left) });
    }
    return out;
  }

  /** Takes stock for tracked sizes; returns what was taken. `partial` takes what's left instead of failing. */
  take(items, partial = false) {
    const taken = [];
    for (const l of items) {
      const left = this.qtyOf(l.id, l.size);
      if (left === null) continue;
      const n = partial ? Math.min(l.qty, Math.max(0, left)) : l.qty;
      if (!n) continue;
      this.sql.exec('UPDATE stock SET qty = qty - ? WHERE product = ? AND size = ?', n, l.id, l.size);
      taken.push({ id: l.id, size: l.size, qty: n });
    }
    return taken;
  }

  put(taken) {
    for (const t of taken) this.sql.exec('UPDATE stock SET qty = qty + ? WHERE product = ? AND size = ?', t.qty, t.id, t.size);
  }

  /** All tracked stock: { productId: { size: qty } } */
  async getStock() {
    const out = {};
    for (const r of this.sql.exec('SELECT product, size, qty FROM stock').toArray()) (out[r.product] ||= {})[r.size] = r.qty;
    return out;
  }

  /** Sets one product's stock. sizes: { size: number | null }; null stops tracking that size. */
  async setStock(product, sizes) {
    for (const [size, qty] of Object.entries(sizes)) {
      if (qty === null) this.sql.exec('DELETE FROM stock WHERE product = ? AND size = ?', product, size);
      else this.sql.exec('INSERT INTO stock (product, size, qty) VALUES (?, ?, ?) ON CONFLICT(product, size) DO UPDATE SET qty = excluded.qty', product, size, qty);
    }
    return (await this.getStock())[product] || {};
  }
}
