const pool   = require('../config/db');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../services/encryptionService');

const generateFingerprint = (title, userId, timestamp) => {
  const canonical = [title, userId, timestamp]
    .map(s => (s || '').toString().toLowerCase().trim())
    .join('||');
  return crypto.createHash('sha256').update(canonical).digest('hex');
};

const createIdea = async (userId, title, category, askingPriceUsd) => {
  const fingerprint = generateFingerprint(title, userId, Date.now().toString());
  const { rows: existing } = await pool.query(
    'SELECT id FROM ideas WHERE idea_fingerprint = $1', [fingerprint]
  );
  if (existing.length > 0) throw new Error('Duplicate idea fingerprint detected');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO ideas (creator_id, title, category, asking_price_usd, idea_fingerprint, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING id, creator_id, title, category, asking_price_usd, idea_fingerprint, status, created_at`,
      [userId, title, category, askingPriceUsd || null, fingerprint]
    );
    const idea = rows[0];
    await client.query(
      `INSERT INTO idea_ownership_ledger (idea_id, owner_id, event_type, details)
       VALUES ($1, $2, 'creation', $3)`,
      [idea.id, userId, JSON.stringify({ fingerprint, title, timestamp: new Date().toISOString() })]
    );
    await client.query('COMMIT');
    return idea;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const addIdeaLayer = async (ideaId, layerNumber, layerName, contentPlain, unlockConditions) => {
  const contentEncrypted = encrypt(contentPlain);
  const { rows } = await pool.query(
    `INSERT INTO cid_layers (idea_id, layer_number, layer_name, content_plain, unlock_conditions)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, idea_id, layer_number, layer_name, unlock_conditions, created_at`,
    [ideaId, layerNumber, layerName, contentEncrypted, JSON.stringify(unlockConditions || {})]
  );
  return rows[0];
};

const getIdeaLayersForUser = async (ideaId, userId) => {
  const { rows: layers } = await pool.query(
    `SELECT id, idea_id, layer_number, layer_name, unlock_conditions, unlock_count, created_at, content_plain
     FROM cid_layers WHERE idea_id = $1 ORDER BY layer_number ASC`,
    [ideaId]
  );
  const { rows: ownership } = await pool.query(
    `SELECT id FROM idea_ownership_ledger WHERE idea_id = $1 AND owner_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [ideaId, userId]
  );
  const isOwner = ownership.length > 0;
  const { rows: ideaRows } = await pool.query('SELECT creator_id FROM ideas WHERE id = $1', [ideaId]);
  const isCreator = ideaRows[0]?.creator_id === userId;
  return layers.map(layer => {
    let canAccess = false;
    if (layer.layer_number === 1) canAccess = true;
    if (isCreator || isOwner) canAccess = true;
    let content = null;
    if (canAccess && layer.content_plain) {
      try { content = decrypt(layer.content_plain); } catch (err) { content = null; }
    }
    return { ...layer, can_access: canAccess, content, content_plain: undefined };
  });
};

const getAllPublishedIdeas = async () => {
  const { rows } = await pool.query(
    `SELECT i.id, i.title, i.category, i.asking_price_usd,
            i.innovation_score, i.status, i.created_at, i.published_at,
            u.username AS creator_username, COUNT(c.id) AS layer_count
     FROM ideas i
     JOIN users u ON u.id = i.creator_id
     LEFT JOIN cid_layers c ON c.idea_id = i.id
     WHERE i.status = 'published'
     GROUP BY i.id, u.username
     ORDER BY i.created_at DESC`
  );
  return rows;
};

const getIdeaById = async (ideaId, userId) => {
  const { rows } = await pool.query(
    `SELECT i.*, u.username AS creator_username
     FROM ideas i JOIN users u ON u.id = i.creator_id WHERE i.id = $1`,
    [ideaId]
  );
  if (!rows[0]) return null;
  const layers = await getIdeaLayersForUser(ideaId, userId);
  return { ...rows[0], layers };
};

const transferIdeaOwnership = async (ideaId, fromUserId, toUserId, transferType, priceUsd) => {
  const { rows: ownerCheck } = await pool.query(
    `SELECT id FROM idea_ownership_ledger WHERE idea_id = $1 AND owner_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [ideaId, fromUserId]
  );
  if (ownerCheck.length === 0) throw new Error('Only the current owner can transfer this idea');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO idea_ownership_ledger (idea_id, owner_id, event_type, details) VALUES ($1, $2, 'transfer', $3)`,
      [ideaId, toUserId, JSON.stringify({ from: fromUserId, type: transferType, price: priceUsd })]
    );
    await client.query(
      `UPDATE ideas SET status = $1 WHERE id = $2`,
      [transferType === 'sale' ? 'sold' : 'licensed', ideaId]
    );
    await client.query('COMMIT');
    return { ideaId, newOwnerId: toUserId, transferType };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const publishIdea = async (ideaId, userId) => {
  const { rows: ideaRows } = await pool.query('SELECT * FROM ideas WHERE id = $1', [ideaId]);
  if (!ideaRows[0]) return null;
  if (ideaRows[0].creator_id !== userId) throw new Error('Only the creator can publish this idea');
  const { rows: layerRows } = await pool.query(
    'SELECT id FROM cid_layers WHERE idea_id = $1 LIMIT 1', [ideaId]
  );
  if (layerRows.length === 0) throw new Error('Idea must have at least one layer before publishing');
  const { rows } = await pool.query(
    `UPDATE ideas SET status = 'published', published_at = NOW()
     WHERE id = $1 RETURNING id, title, status, published_at, idea_fingerprint`,
    [ideaId]
  );
  return rows[0];
};

const getIdeaFingerprint = async (ideaId, userId) => {
  const { rows } = await pool.query(
    `SELECT i.id, i.title, i.idea_fingerprint, i.created_at, i.published_at,
            i.status, u.username AS creator_username,
            iol.created_at AS ledger_timestamp
     FROM ideas i
     JOIN users u ON u.id = i.creator_id
     LEFT JOIN idea_ownership_ledger iol ON iol.idea_id = i.id AND iol.event_type = 'creation'
     WHERE i.id = $1`,
    [ideaId]
  );
  if (!rows[0]) return null;
  const idea = rows[0];
  return {
    idea_id:          idea.id,
    title:            idea.title,
    creator:          idea.creator_username,
    idea_fingerprint: idea.idea_fingerprint,
    algorithm:        'SHA-256',
    created_at:       idea.created_at,
    published_at:     idea.published_at,
    ledger_timestamp: idea.ledger_timestamp,
    status:           idea.status,
    verification_url: `https://innovation-exchange.vercel.app/verify/${idea.idea_fingerprint}`,
    platform_version: '1.0.0',
  };
};

module.exports = {
  createIdea,
  addIdeaLayer,
  getIdeaLayersForUser,
  getAllPublishedIdeas,
  getIdeaById,
  transferIdeaOwnership,
  generateFingerprint,
  publishIdea,
  getIdeaFingerprint,
};
