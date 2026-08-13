require('./env');

const path = require('path');
const app = require('./app');
const { getDb } = require('./db');

getDb();

const port = Number(process.env.PORT) || 3001;

app.listen(port, () => console.log(`API on :${port}`));
