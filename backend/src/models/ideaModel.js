const pool   = require('../config/db');
const crypto = require('crypto');

const generateFingerprint = (title, userId, timestamp) => {
  const canonical = [title, userId, timestamp]
    .map(s => (s || '').toString().toLowerCase().trim())
    .join('||');
  return crypto.createHash('sha256').update(canonical).digest('hex');
};

const createIdea = async (userId, title, category, askingPriceUsd) => {
  const fingerprint = generateFingerprint(title, userId, Date.now().toString());
  const { rows: existing } = await pool.query(
    'SELECT id FROM ideas WHERE idea_fingerprint = $1',
    [fingerprint]
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
  const { rows } = await pool.query(
    `INSERT INTO cid_layers (idea_id, layer_number, layer_name, content_plain, unlock_conditions)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, idea_id, layer_number, layer_name, unlock_conditions, created_at`,
    [ideaId, layerNumber, layerName, contentPlain, JSON.stringify(unlockConditions || {})]
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
    `SELECT id FROM idea_ownership_ledger
     WHERE idea_id = $1 AND owner_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [ideaId, userId]
  );
  const isOwner = ownership.length > 0;
  const { rows: ideaRows } = await pool.query(
    'SELECT creator_id FROM ideas WHERE id = $1',
    [ideaId]
  );
  const isCreator = ideaRows[0]?.creator_id === userId;

  return layers.map(layer => {
    let canAccess = false;
    if (layer.layer_number === 1) canAccess = true;
    if (isCreator || isOwner) canAccess = true;
    return {
      ...layer,
      can_access: canAccess,
      content: canAccess ? layer.content_plain : null,
      content_plain: undefined,
    };
  });
};

const getAllPublishedIdeas = async () => {
  const { rows } = await pool.query(
    `SELECT i.id, i.title, i.category, i.asking_price_usd,
            i.innovation_score, i.status, i.created_at, i.published_at,
            u.username AS creator_username,
            COUNT(c.id) AS layer_count
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
     FROM ideas i JOIN users u ON u.id = i.creator_id
     WHERE i.id = $1`,
    [ideaId]
  );
  if (!rows[0]) return null;
  const layers = await getIdeaLayersForUser(ideaId, userId);
  return { ...rows[0], layers };
};

const transferIdeaOwnership = async (ideaId, fromUserId, toUserId, transferType, priceUsd) => {
  const { rows: ownerCheck } = await pool.query(
    `SELECT id FROM idea_ownership_ledger
     WHERE idea_id = $1 AND owner_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [ideaId, fromUserId]
  );
  if (ownerCheck.length === 0) throw new Error('Only the current owner can transfer this idea');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO idea_ownership_ledger (idea_id, owner_id, event_type, details)
       VALUES ($1, $2, 'transfer', $3)`,
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

module.exports = {
  createIdea,
  addIdeaLayer,
  getIdeaLayersForUser,
  getAllPublishedIdeas,
  getIdeaById,
  transferIdeaOwnership,
  generateFingerprint,
};
