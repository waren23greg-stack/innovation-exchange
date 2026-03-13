const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const pool    = require('../config/db');
const { createUser, getUserByEmail } = require('../models/userModel');

const router = express.Router();

const signAccess = (u) => jwt.sign(
  { id: u.id, email: u.email, username: u.username },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
);
const signRefresh = (u) => jwt.sign(
  { id: u.id },
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
);

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email and password are required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const existing = await getUserByEmail(email);
    if (existing)
      return res.status(409).json({ error: 'An account with this email already exists.' });
    const user = await createUser(username, email, password);
    res.status(201).json({
      user: { id: user.id, username: user.username, email: user.email, kyc_status: user.kyc_status },
      accessToken:  signAccess(user),
      refreshToken: signRefresh(user),
    });
  } catch (err) {
    console.error('[auth/register] FULL ERROR:', err);
    res.status(500).json({ error: 'Registration failed.', detail: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required.' });
  try {
    const user = await getUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password.' });
    if (user.is_suspended)
      return res.status(403).json({ error: 'This account has been suspended.' });
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    res.json({
      user: { id: user.id, username: user.username, email: user.email, kyc_status: user.kyc_status },
      accessToken:  signAccess(user),
      refreshToken: signRefresh(user),
    });
  } catch (err) {
    console.error('[auth/login] FULL ERROR:', err);
    res.status(500).json({ error: 'Login failed.', detail: err.message });
  }
});

router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });
  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );
    const accessToken = jwt.sign(
      { id: decoded.id },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
});

module.exports = router;
