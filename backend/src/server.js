require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');

const authRoutes   = require('./routes/authRoutes');
const ideaRoutes   = require('./routes/ideaRoutes');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts' },
});
app.use(globalLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Innovation Exchange API', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.use('/api/auth',  authLimiter, authRoutes);
app.use('/api/ideas', ideaRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ Innovation Exchange API running on http://localhost:${PORT}`);
});

module.exports = app;
