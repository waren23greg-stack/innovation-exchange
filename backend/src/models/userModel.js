const pool        = require('../config/db');
const bcrypt      = require('bcrypt');
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

const createUser = async (username, email, password) => {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, kyc_status, created_at`,
    [username, email, passwordHash]
  );
  return rows[0];
};

const getUserByEmail = async (email) => {
  const { rows } = await pool.query(
    `SELECT id, username, email, password_hash, kyc_status, reputation_score, is_suspended
     FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
};

const getUserById = async (id) => {
  const { rows } = await pool.query(
    `SELECT id, username, email, kyc_status, reputation_score, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

module.exports = { createUser, getUserByEmail, getUserById };
