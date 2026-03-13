const express  = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  createIdea,
  addIdeaLayer,
  getAllPublishedIdeas,
  getIdeaById,
  transferIdeaOwnership,
} = require('../models/ideaModel');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const ideas = await getAllPublishedIdeas();
    res.json({ ideas });
  } catch (err) {
    console.error('[GET /ideas]', err.message);
    res.status(500).json({ error: 'Failed to fetch ideas' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user.id);
    if (!idea) return res.status(404).json({ error: 'Idea not found' });
    res.json({ idea });
  } catch (err) {
    console.error('[GET /ideas/:id]', err.message);
    res.status(500).json({ error: 'Failed to fetch idea' });
  }
});

router.post('/', protect, async (req, res) => {
  try {
    const { title, category, asking_price_usd } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const idea = await createIdea(req.user.id, title, category, asking_price_usd);
    res.status(201).json({ message: 'Idea created', idea });
  } catch (err) {
    console.error('[POST /ideas]', err.message);
    if (err.message.includes('Duplicate')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create idea' });
  }
});

router.post('/:id/layers', protect, async (req, res) => {
  try {
    const { layer_number, layer_name, content, unlock_conditions } = req.body;
    if (!layer_number || !layer_name) {
      return res.status(400).json({ error: 'layer_number and layer_name are required' });
    }
    const layer = await addIdeaLayer(
      req.params.id,
      layer_number,
      layer_name,
      content,
      unlock_conditions
    );
    res.status(201).json({ message: 'Layer added', layer });
  } catch (err) {
    console.error('[POST /ideas/:id/layers]', err.message);
    res.status(500).json({ error: 'Failed to add layer' });
  }
});

router.post('/:id/transfer', protect, async (req, res) => {
  try {
    const { to_user_id, transfer_type, price_usd } = req.body;
    if (!to_user_id || !transfer_type) {
      return res.status(400).json({ error: 'to_user_id and transfer_type are required' });
    }
    const result = await transferIdeaOwnership(
      req.params.id,
      req.user.id,
      to_user_id,
      transfer_type,
      price_usd
    );
    res.json({ message: 'Ownership transferred', result });
  } catch (err) {
    console.error('[POST /ideas/:id/transfer]', err.message);
    if (err.message.includes('Only the current owner')) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Transfer failed' });
  }
});

module.exports = router;
