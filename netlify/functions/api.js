const express = require('express');
const serverless = require('serverless-http');
const app = express();

app.get('/api', (req, res) => {
  res.json({ ok: true, message: 'Express on Netlify WORKS!' });
});

app.get('/api/hello/:name', (req, res) => {
  res.json({ hello: req.params.name, time: new Date().toISOString() });
});

module.exports.handler = serverless(app);
