const pool    = require('../config/db');
const crypto  = require('crypto');
const { decrypt } = require('./encryptionService');

const generateWatermarkToken = (viewerId, layerId) => {
  return crypto.createHash('sha256')
    .update(`${viewerId}:${layerId}:${Date.now()}`)
    .digest('hex').substring(0, 32);
};

const logDisclosureEvent = async (client, { ideaId, layerId, viewerId, eventType, watermarkToken, ndaEnvelopeId }) => {
  await client.query(
    `INSERT INTO disclosure_events (idea_id, layer_id, viewer_id, event_type, viewer_watermark, nda_envelope_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ideaId, layerId, viewerId, eventType, watermarkToken, ndaEnvelopeId || null]
  );
};

const unlockLayer = async ({ ideaId, layerNumber, userId, viewerIp, ndaEnvelopeId }) => {
  const client = await pool.connect();
  try {
    const { rows: layers } = await client.query(
      `SELECT * FROM cid_layers WHERE idea_id = $1 AND layer_number = $2`,
      [ideaId, layerNumber]
    );
    if (layers.length === 0) return { success: false, error: 'Layer not found', code: 404 };
    const layer = layers[0];
    const conditions = layer.unlock_conditions || {};

    const { rows: users } = await client.query(
      `SELECT id, kyc_status, is_suspended FROM users WHERE id = $1`, [userId]
    );
    if (users.length === 0) return { success: false, error: 'User not found', code: 404 };
    if (users[0].is_suspended) return { success: false, error: 'Account suspended', code: 403 };
    const user = users[0];

    const { rows: ideaRows } = await client.query(
      `SELECT creator_id FROM ideas WHERE id = $1`, [ideaId]
    );
    const isCreator = ideaRows[0]?.creator_id === userId;
    const { rows: ownerRows } = await client.query(
      `SELECT id FROM idea_ownership_ledger WHERE idea_id = $1 AND owner_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [ideaId, userId]
    );
    const isOwner = ownerRows.length > 0;

    if (conditions.kyc_required && !isCreator && !isOwner) {
      if (user.kyc_status !== 'verified') {
        return { success: false, error: 'Identity verification required', code: 403, action: 'kyc_required' };
      }
    }

    if (conditions.nda_required && !isCreator && !isOwner) {
      if (!ndaEnvelopeId) {
        return { success: false, error: 'NDA signature required', code: 403, action: 'nda_required', nda_template_url: `/api/ideas/${ideaId}/nda-template` };
      }
    }

    if (conditions.escrow_amount_usd && !isCreator && !isOwner) {
      const { rows: escrowRows } = await client.query(
        `SELECT id FROM disclosure_events WHERE idea_id = $1 AND viewer_id = $2 AND event_type = 'escrow_deposited' LIMIT 1`,
        [ideaId, userId]
      );
      if (escrowRows.length === 0) {
        return { success: false, error: `Escrow deposit of $${conditions.escrow_amount_usd} required`, code: 403, action: 'escrow_required', amount_usd: conditions.escrow_amount_usd, payment_url: `/api/ideas/${ideaId}/escrow` };
      }
    }

    await client.query('BEGIN');
    const watermarkToken = generateWatermarkToken(userId, layer.id);

    await logDisclosureEvent(client, { ideaId, layerId: layer.id, viewerId: userId, eventType: 'layer_unlocked', watermarkToken, ndaEnvelopeId });

    if (ndaEnvelopeId && conditions.nda_required) {
      await logDisclosureEvent(client, { ideaId, layerId: layer.id, viewerId: userId, eventType: 'nda_signed', watermarkToken, ndaEnvelopeId });
    }

    await client.query(`UPDATE cid_layers SET unlock_count = unlock_count + 1 WHERE id = $1`, [layer.id]);
    await client.query('COMMIT');

    let content = null;
    if (layer.content_plain) {
      try {
        content = decrypt(layer.content_plain);
        content = `${content}\n\n---\nConfidential | Viewer: ${watermarkToken} | ${new Date().toISOString()}`;
      } catch (err) {
        console.error('[CID] Decrypt error:', err.message);
      }
    }

    return {
      success: true,
      layer: { id: layer.id, layer_number: layer.layer_number, layer_name: layer.layer_name, content, watermark_token: watermarkToken, unlocked_at: new Date().toISOString() },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[CID Unlock] Error:', err.message);
    return { success: false, error: 'Internal error during layer unlock', code: 500 };
  } finally {
    client.release();
  }
};

module.exports = { unlockLayer, logDisclosureEvent, generateWatermarkToken };
