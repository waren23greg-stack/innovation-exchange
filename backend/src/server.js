require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const authRoutes = require('./routes/authRoutes');
const ideaRoutes = require('./routes/ideaRoutes');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '10kb' }));
app.use(cors({ origin: '*' }));
app.use(helmet());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Innovation Exchange API', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/ideas', ideaRoutes);

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅ Innovation Exchange API running on http://localhost:${PORT}`);
});

module.exports = app;
