const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on('connect', () => console.log('✅ PostgreSQL connected'));
pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

// Keep connection alive — ping every 4 minutes
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
  } catch(err) {
    console.error('[DB] Keepalive failed:', err.message);
  }
}, 4 * 60 * 1000);

module.exports = pool;
