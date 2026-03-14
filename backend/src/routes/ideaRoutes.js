const express  = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  createIdea, addIdeaLayer, getAllPublishedIdeas,
  getIdeaById, transferIdeaOwnership, publishIdea, getIdeaFingerprint,
} = require('../models/ideaModel');
const { unlockLayer }                        = require('../services/cidUnlockService');
const { sendNDAForSigning, checkEnvelopeStatus } = require('../services/ndaService');
const { createEscrowHold, hasEscrowDeposit } = require('../services/escrowService');
const { generateOwnershipCertificate }       = require('../services/certificateService');
const pool = require('../config/db');
const crypto = require('crypto');

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

// ─── GET /api/ideas/:id/certificate/pdf — download legal PDF certificate ──────
router.get('/:id/certificate/pdf', protect, async (req, res) => {
  try {
    // Get idea + latest ownership
    const { rows } = await pool.query(
      `SELECT i.*, u.username AS creator_name,
              iol.owner_id, iol.event_type, iol.details, iol.created_at AS transfer_date,
              ou.username AS owner_name
       FROM ideas i
       JOIN users u ON u.id = i.creator_id
       LEFT JOIN idea_ownership_ledger iol ON iol.idea_id = i.id
       LEFT JOIN users ou ON ou.id = iol.owner_id
       WHERE i.id = $1
       ORDER BY iol.created_at DESC
       LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Idea not found' });
    const idea = rows[0];

    const transactionRef = `IX-CERT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const pdfBuffer = await generateOwnershipCertificate({
      ideaTitle:       idea.title,
      ideaId:          idea.id,
      fingerprint:     idea.idea_fingerprint,
      creatorName:     idea.creator_name,
      ownerName:       idea.owner_name || idea.creator_name,
      transferType:    idea.event_type || 'creation',
      priceUsd:        idea.details?.price || null,
      effectiveDate:   idea.transfer_date || idea.created_at,
      platformVersion: '1.0.0',
      transactionRef,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="IX-Certificate-${idea.id}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[GET /ideas/:id/certificate/pdf]', err.message);
    res.status(500).json({ error: 'Failed to generate certificate PDF' });
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
    if (err.message.includes('Only the creator')) return res.status(403).json({ error: err.message });
    if (err.message.includes('at least one layer')) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Failed to publish idea' });
  }
});

router.post('/:id/layers', protect, async (req, res) => {
  try {
    const { layer_number, layer_name, content, unlock_conditions } = req.body;
    if (!layer_number || !layer_name) {
      return res.status(400).json({ error: 'layer_number and layer_name are required' });
    }
    const layer = await addIdeaLayer(req.params.id, layer_number, layer_name, content, unlock_conditions);
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
      ideaId: req.params.id, layerNumber: parseInt(req.params.layerNumber),
      userId: req.user.id, viewerIp, ndaEnvelopeId: nda_envelope_id,
    });
    if (!result.success) {
      return res.status(result.code || 403).json({
        error: result.error, action: result.action,
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

router.post('/:id/nda', protect, async (req, res) => {
  try {
    const { viewer_email, viewer_name } = req.body;
    if (!viewer_email || !viewer_name) {
      return res.status(400).json({ error: 'viewer_email and viewer_name are required' });
    }
    const { rows } = await pool.query(
      `SELECT i.title, u.username AS creator_name FROM ideas i JOIN users u ON u.id = i.creator_id WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Idea not found' });
    const result = await sendNDAForSigning({
      ideaId: req.params.id, ideaTitle: rows[0].title,
      creatorName: rows[0].creator_name, viewerName: viewer_name, viewerEmail: viewer_email,
    });
    res.json({ message: 'NDA sent for signing', envelope_id: result.envelopeId, status: result.status, stub: result.stub || false });
  } catch (err) {
    console.error('[POST /ideas/:id/nda]', err.message);
    res.status(500).json({ error: 'Failed to send NDA' });
  }
});

router.get('/:id/nda/:envelopeId', protect, async (req, res) => {
  try {
    const status = await checkEnvelopeStatus(req.params.envelopeId);
    res.json({ envelope_id: req.params.envelopeId, ...status });
  } catch (err) {
    console.error('[GET /ideas/:id/nda/:envelopeId]', err.message);
    res.status(500).json({ error: 'Failed to check NDA status' });
  }
});

router.post('/:id/escrow', protect, async (req, res) => {
  try {
    const { layer_number, amount_usd } = req.body;
    if (!layer_number || !amount_usd) {
      return res.status(400).json({ error: 'layer_number and amount_usd are required' });
    }
    const alreadyPaid = await hasEscrowDeposit(req.params.id, req.user.id, layer_number);
    if (alreadyPaid) return res.json({ message: 'Escrow already deposited', already_paid: true });
    const result = await createEscrowHold({ ideaId: req.params.id, userId: req.user.id, amountUsd: amount_usd, layerNumber: layer_number });
    res.json({ message: 'Escrow hold created', payment_ref: result.payment_ref, amount_usd: result.amount_usd, status: result.status, stub: result.stub || false });
  } catch (err) {
    console.error('[POST /ideas/:id/escrow]', err.message);
    res.status(500).json({ error: 'Failed to create escrow hold' });
  }
});

router.post('/:id/transfer', protect, async (req, res) => {
  try {
    const { to_user_id, transfer_type, price_usd } = req.body;
    if (!to_user_id || !transfer_type) {
      return res.status(400).json({ error: 'to_user_id and transfer_type are required' });
    }
    const result = await transferIdeaOwnership(req.params.id, req.user.id, to_user_id, transfer_type, price_usd);

    // Auto-generate PDF certificate after transfer
    try {
      const { rows } = await pool.query(
        `SELECT i.*, u.username AS creator_name, ou.username AS owner_name
         FROM ideas i
         JOIN users u ON u.id = i.creator_id
         JOIN users ou ON ou.id = $1
         WHERE i.id = $2`,
        [to_user_id, req.params.id]
      );
      if (rows[0]) {
        const transactionRef = `IX-XFER-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        await generateOwnershipCertificate({
          ideaTitle: rows[0].title, ideaId: rows[0].id,
          fingerprint: rows[0].idea_fingerprint,
          creatorName: rows[0].creator_name, ownerName: rows[0].owner_name,
          transferType: transfer_type, priceUsd: price_usd,
          effectiveDate: new Date(), platformVersion: '1.0.0', transactionRef,
        });
        console.log(`[Transfer] Certificate generated: ${transactionRef}`);
      }
    } catch(certErr) {
      console.error('[Transfer] Certificate generation failed:', certErr.message);
    }

    res.json({ message: 'Ownership transferred', result });
  } catch (err) {
    console.error('[POST /ideas/:id/transfer]', err.message);
    if (err.message.includes('Only the current owner')) return res.status(403).json({ error: err.message });
    res.status(500).json({ error: 'Transfer failed' });
  }
});

module.exports = router;
