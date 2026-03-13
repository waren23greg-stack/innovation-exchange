require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.send('Innovation Exchange Backend is running');
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});