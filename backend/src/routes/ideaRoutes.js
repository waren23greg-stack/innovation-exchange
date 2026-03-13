const express  = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  createIdea,
  addIdeaLayer,
  getAllPublishedIdeas,
  getIdeaById,
  transferIdeaOwnership,
  publishIdea,
  getIdeaFingerprint,
} = require('../models/ideaModel');
const { unlockLayer } = require('../services/cidUnlockService');
const { sendNDAForSigning, checkEnvelopeStatus } = require('../services/ndaService');
const pool = require('../config/db');

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

router.get('/:id/certificate', protect, async (req, res) => {
  try {
    const cert = await getIdeaFingerprint(req.params.id, req.user.id);
    if (!cert) return res.status(404).json({ error: 'Idea not found' });
    res.json({ certificate: cert });
  } catch (err) {
    console.error('[GET /ideas/:id/certificate]', err.message);
    res.status(500).json({ error: 'Failed to fetch certificate' });
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

router.post('/:id/publish', protect, async (req, res) => {
  try {
    const idea = await publishIdea(req.params.id, req.user.id);
    if (!idea) return res.status(404).json({ error: 'Idea not found' });
    res.json({ message: 'Idea published', idea });
  } catch (err) {
    console.error('[POST /ideas/:id/publish]', err.message);
    if (err.message.includes('Only the creator')) {
      return res.status(403).json({ error: err.message });
    }
    if (err.message.includes('at least one layer')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to publish idea' });
  }
});

router.post('/:id/layers', protect, async (req, res) => {
  try {
    const { layer_number, layer_name, content, unlock_conditions } = req.body;
    if (!layer_number || !layer_name) {
      return res.status(400).json({ error: 'layer_number and layer_name are required' });
    }
    const layer = await addIdeaLayer(
      req.params.id, layer_number, layer_name, content, unlock_conditions
    );
    res.status(201).json({ message: 'Layer added and encrypted', layer });
  } catch (err) {
    console.error('[POST /ideas/:id/layers]', err.message);
    res.status(500).json({ error: 'Failed to add layer' });
  }
});

router.post('/:id/layers/:layerNumber/unlock', protect, async (req, res) => {
  try {
    const { nda_envelope_id } = req.body;
    const viewerIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await unlockLayer({
      ideaId:        req.params.id,
      layerNumber:   parseInt(req.params.layerNumber),
      userId:        req.user.id,
      viewerIp,
      ndaEnvelopeId: nda_envelope_id,
    });
    if (!result.success) {
      return res.status(result.code || 403).json({
        error:  result.error,
        action: result.action,
        ...(result.nda_template_url && { nda_template_url: result.nda_template_url }),
        ...(result.payment_url      && { payment_url: result.payment_url }),
        ...(result.amount_usd       && { amount_usd: result.amount_usd }),
      });
    }
    res.json({ message: 'Layer unlocked', layer: result.layer });
  } catch (err) {
    console.error('[unlock]', err.message);
    res.status(500).json({ error: 'Unlock failed' });
  }
});

// ─── POST /api/ideas/:id/nda — send NDA to viewer ────────────────────────────
router.post('/:id/nda', protect, async (req, res) => {
  try {
    const { viewer_email, viewer_name } = req.body;
    if (!viewer_email || !viewer_name) {
      return res.status(400).json({ error: 'viewer_email and viewer_name are required' });
    }

    // Get idea details
    const { rows } = await pool.query(
      `SELECT i.title, u.username AS creator_name
       FROM ideas i JOIN users u ON u.id = i.creator_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Idea not found' });

    const result = await sendNDAForSigning({
      ideaId:      req.params.id,
      ideaTitle:   rows[0].title,
      creatorName: rows[0].creator_name,
      viewerName:  viewer_name,
      viewerEmail: viewer_email,
    });

    res.json({
      message:     'NDA sent for signing',
      envelope_id: result.envelopeId,
      status:      result.status,
      stub:        result.stub || false,
    });
  } catch (err) {
    console.error('[POST /ideas/:id/nda]', err.message);
    res.status(500).json({ error: 'Failed to send NDA' });
  }
});

// ─── GET /api/ideas/:id/nda/:envelopeId — check NDA signing status ────────────
router.get('/:id/nda/:envelopeId', protect, async (req, res) => {
  try {
    const status = await checkEnvelopeStatus(req.params.envelopeId);
    res.json({ envelope_id: req.params.envelopeId, ...status });
  } catch (err) {
    console.error('[GET /ideas/:id/nda/:envelopeId]', err.message);
    res.status(500).json({ error: 'Failed to check NDA status' });
  }
});

router.post('/:id/transfer', protect, async (req, res) => {
  try {
    const { to_user_id, transfer_type, price_usd } = req.body;
    if (!to_user_id || !transfer_type) {
      return res.status(400).json({ error: 'to_user_id and transfer_type are required' });
    }
    const result = await transferIdeaOwnership(
      req.params.id, req.user.id, to_user_id, transfer_type, price_usd
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
