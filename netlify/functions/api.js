const express = require('express');
const serverless = require('serverless-http');
const cookieParser = require('cookie-parser');
const { getStore } = require('@netlify/blobs');

const app = express();
const store = getStore('toko-data');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser('rahasia-toko-online-123'));

// --- HELPERS ---
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
const genCode = () => `ORD-${Date.now().toString().slice(-6)}`;

const defaultSettings = {
  storeName: 'Toko Netlify', tagline: 'Belanja aman & cepat', whatsapp: '6281234567890',
  bankName: 'BCA', bankAccount: '1234567890', bankHolder: 'Nama Pemilik',
  ewalletName: 'DANA', ewalletAccount: '081234567890', shippingFlat: 15000
};

// --- DATABASE MIDDLEWARE (Netlify Blobs) ---
app.use(async (req, res, next) => {
  try {
    req.db = {
      products: (await store.get('products', { type: 'json' })) || [
        { id: 1, name: 'Produk Contoh', price: 100000, stock: 10, categoryId: 1, images: ['https://placehold.co/600x400'], description: 'Deskripsi', active: true, featured: true }
      ],
      categories: (await store.get('categories', { type: 'json' })) || [{ id: 1, name: 'Umum' }],
      orders: (await store.get('orders', { type: 'json' })) || [],
      settings: (await store.get('settings', { type: 'json' })) || defaultSettings
    };
    next();
  } catch (err) {
    res.status(500).send('Database Error: ' + err.message);
  }
});

const saveDB = async (key, data) => await store.setJSON(key, data);

const readCart = (req) => {
  try { return req.signedCookies?.cart ? JSON.parse(Buffer.from(req.signedCookies.cart, 'base64').toString()) : []; } catch { return []; }
};
const writeCart = (res, items) => {
  res.cookie('cart', Buffer.from(JSON.stringify(items.filter(i => i.qty > 0))).toString('base64'), { signed: true, httpOnly: true });
};
const cartCount = (req) => readCart(req).reduce((s, i) => s + i.qty, 0);
const isAuthed = (req) => req.signedCookies?.admin === 'ok';

// --- LAYOUT & UI ---
function page(req, title, body, opts = {}) {
  const s = req.db.settings;
  const admin = opts.admin;
  const nav = admin 
    ? `<nav style="background:#1e293b;padding:15px;color:white"><div style="max-width:1000px;margin:auto;display:flex;justify-content:space-between"><a href="/admin" style="color:#60a5fa;text-decoration:none;font-weight:bold">⚙ ADMIN</a><div><a href="/admin/produk" style="color:white;margin-right:15px">Produk</a><a href="/admin/pesanan" style="color:white;margin-right:15px">Pesanan</a><a href="/" style="color:#f87171">Keluar</a></div></div></nav>`
    : `<nav style="background:#1e293b;padding:15px;color:white"><div style="max-width:1000px;margin:auto;display:flex;justify-content:space-between"><a href="/" style="color:#60a5fa;text-decoration:none;font-weight:bold">🛒 ${esc(s.storeName)}</a><div><a href="/produk" style="color:white;margin-right:15px;text-decoration:none">Produk</a><a href="/cart" style="color:white;text-decoration:none">🛒 Cart (${cartCount(req)})</a></div></div></nav>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:0}.card{background:#1e293b;padding:20px;border-radius:10px;margin-bottom:15px;border:1px solid #334155}.btn{background:#3b82f6;color:white;padding:10px 15px;border:none;border-radius:5px;cursor:pointer;text-decoration:none;display:inline-block}.input{width:100%;padding:10px;margin:5px 0 15px;background:#0f172a;border:1px solid #334155;color:white;border-radius:5px;box-sizing:border-box}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:15px}.container{max-width:1000px;margin:20px auto;padding:0 15px}</style></head><body>${nav}<div class="container">${body}</div><footer style="text-align:center;padding:20px;color:#64748b;font-size:12px">© ${new Date().getFullYear()} ${esc(s.storeName)}</footer></body></html>`;
}

// --- PUBLIC ROUTES ---
app.get('/api', (req, res) => res.json({ status: "Toko Online API Aktif" }));

app.get('/api/produk', (req, res) => res.send(page(req, 'Home', `
  <div style="text-align:center;padding:40px 0"><h1>Selamat Datang di ${esc(req.db.settings.storeName)}</h1></div>
  <div class="grid">${req.db.products.map(p => `
    <a href="/api/detail?id=${p.id}" style="text-decoration:none;color:white">
      <div class="card">
        <img src="${p.images[0]}" style="width:100%;border-radius:5px">
        <h3>${esc(p.name)}</h3><p style="color:#60a5fa;font-weight:bold">${rupiah(p.price)}</p>
      </div>
    </a>`).join('')}</div>
`)));

app.get('/api/detail', (req, res) => {
  const p = req.db.products.find(x => x.id == req.query.id);
  if (!p) return res.redirect('/api/produk');
  res.send(page(req, p.name, `<div class="card">
    <img src="${p.images[0]}" style="width:100%;max-width:400px;border-radius:5px">
    <h2>${esc(p.name)}</h2><h3 style="color:#60a5fa">${rupiah(p.price)}</h3>
    <p>${esc(p.description)}</p><p>Stok: ${p.stock}</p>
    <form action="/api/cart/add" method="POST">
      <input type="hidden" name="id" value="${p.id}">
      <input type="number" name="qty" value="1" min="1" max="${p.stock}" class="input" style="width:80px">
      <button class="btn">Tambah ke Cart</button>
    </form></div>`));
});

app.post('/api/cart/add', (req, res) => {
  const cart = readCart(req); const id = Number(req.body.id); const qty = Number(req.body.qty);
  const existing = cart.find(c => c.id === id);
  if (existing) existing.qty += qty; else cart.push({ id, qty });
  writeCart(res, cart); res.redirect('/api/cart');
});

app.get('/api/cart', (req, res) => {
  const cart = readCart(req);
  const items = cart.map(c => { const p = req.db.products.find(x => x.id === c.id); return p ? { ...c, p, sub: p.price * c.qty } : null; }).filter(Boolean);
  const total = items.reduce((s, i) => s + i.sub, 0);
  res.send(page(req, 'Cart', `<div class="card"><h2>Cart Belanja</h2>
    ${items.map(i => `<div style="border-bottom:1px solid #334155;padding:10px 0">${esc(i.p.name)} (${i.qty}x) - ${rupiah(i.sub)}</div>`).join('')}
    <h3>Total: ${rupiah(total)}</h3>
    ${items.length ? `<a href="/api/checkout" class="btn" style="margin-top:15px">Checkout</a>` : 'Cart Kosong'}
  </div>`));
});

app.get('/api/checkout', (req, res) => res.send(page(req, 'Checkout', `<div class="card"><h2>Data Pengiriman</h2>
  <form action="/api/checkout" method="POST">
    <label>Nama</label><input name="name" class="input" required>
    <label>WA</label><input name="wa" class="input" required>
    <label>Alamat</label><textarea name="address" class="input" required></textarea>
    <button class="btn">Buat Pesanan</button>
  </form></div>`)));

app.post('/api/checkout', async (req, res) => {
  const cart = readCart(req); const { name, wa, address } = req.body;
  const items = cart.map(c => { const p = req.db.products.find(x => x.id === c.id); return { name: p.name, qty: c.qty, price: p.price }; });
  const total = items.reduce((s, i) => s + (i.price * i.qty), 0) + req.db.settings.shippingFlat;
  const order = { code: genCode(), items, total, buyer: { name, wa, address }, status: 'PENDING' };
  req.db.orders.push(order);
  await saveDB('orders', req.db.orders);
  writeCart(res, []);
  res.send(page(req, 'Sukses', `<div class="card"><h2>Pesanan Dibuat!</h2><p>Kode: <b>${order.code}</b></p><p>Total: <b>${rupiah(total)}</b></p><p>Silakan transfer ke ${req.db.settings.bankName} ${req.db.settings.bankAccount}</p></div>`));
});

// --- ADMIN ROUTES ---
app.get('/admin', (req, res) => {
  if (!isAuthed(req)) return res.send(page(req, 'Login', `<div class="card"><h2>Admin Login</h2>
    <form action="/admin" method="POST"><input name="u" class="input" placeholder="User"><input name="p" type="password" class="input" placeholder="Pass"><button class="btn">Login</button></form></div>`));
  res.send(page(req, 'Admin', `<h2>Dashboard</h2><div class="grid">
    <div class="card"><h3>Total Produk</h3><h1>${req.db.products.length}</h1></div>
    <div class="card"><h3>Total Order</h3><h1>${req.db.orders.length}</h1></div>
  </div><a href="/admin/produk" class="btn">Kelola Produk</a> <a href="/admin/pesanan" class="btn">Lihat Pesanan</a>`, { admin: true }));
});

app.post('/admin', (req, res) => {
  if (req.body.u === 'admin' && req.body.p === 'admin123') res.cookie('admin', 'ok', { signed: true }).redirect('/admin');
  else res.redirect('/admin');
});

app.get('/admin/produk', (req, res) => {
  if (!isAuthed(req)) return res.redirect('/admin');
  res.send(page(req, 'Admin Produk', `<h2>Daftar Produk</h2>
    <div class="card">
      <form action="/admin/produk/add" method="POST">
        <input name="name" class="input" placeholder="Nama Produk" required>
        <input name="price" type="number" class="input" placeholder="Harga" required>
        <input name="stock" type="number" class="input" placeholder="Stok" required>
        <input name="img" class="input" placeholder="URL Gambar (https://...)" required>
        <button class="btn">Tambah</button>
      </form>
    </div>
    ${req.db.products.map(p => `<div class="card">${esc(p.name)} - ${rupiah(p.price)}</div>`).join('')}`, { admin: true }));
});

app.post('/admin/produk/add', async (req, res) => {
  req.db.products.push({ id: Date.now(), name: req.body.name, price: Number(req.body.price), stock: Number(req.body.stock), images: [req.body.img], active: true });
  await saveDB('products', req.db.products);
  res.redirect('/admin/produk');
});

app.get('/admin/pesanan', (req, res) => {
  if (!isAuthed(req)) return res.redirect('/admin');
  res.send(page(req, 'Admin Pesanan', `<h2>Daftar Pesanan</h2>
    ${req.db.orders.map(o => `<div class="card"><h3>${o.code}</h3><p>${esc(o.buyer.name)} - ${rupiah(o.total)}</p><p>Status: ${o.status}</p></div>`).join('')}`, { admin: true }));
});

app.use((req, res) => res.redirect('/api/produk'));

module.exports.handler = serverless(app);
