const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.PG_HOST     || process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
  database: process.env.PG_DATABASE || process.env.DB_NAME     || 'innovation_exchange',
  user:     process.env.PG_USER     || process.env.DB_USER,
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});

pool.connect((err, client, release) => {
  if (err) { console.error('❌ Database connection error:', err.message); return; }
  release();
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

module.exports = pool;
