require('dotenv').config();

const express = require('express');
const { getDb } = require('./db');

getDb();

const app = express();

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(3001, () => console.log('API on :3001'));