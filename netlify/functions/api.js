const express = require('express');
const serverless = require('serverless-http');
const { getStore } = require('@netlify/blobs');

const app = express();
app.use(express.json());

// Ini database kita
const store = getStore('toko-data');

// Route 1: Cek Express
app.get('/api', (req, res) => {
  res.json({ ok: true, message: 'Express on Netlify WORKS!' });
});

// Route 2: Tes Simpan Data (POST)
app.post('/api/tambah', async (req, res) => {
  const namaBarang = req.body.nama || 'Barang Test';
  await store.set('produk-terakhir', namaBarang);
  res.json({ sukses: true, pesan: `Berhasil menyimpan: ${namaBarang}` });
});

// Route 3: Tes Baca Data (GET)
app.get('/api/lihat', async (req, res) => {
  const namaBarang = await store.get('produk-terakhir');
  res.json({ data_tersimpan: namaBarang || 'Belum ada data' });
});

module.exports.handler = serverless(app);
