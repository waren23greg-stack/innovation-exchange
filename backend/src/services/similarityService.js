const pool = require('../config/db');

const BLOCK_THRESHOLD = 0.95;
const WARN_THRESHOLD  = 0.85;
const HF_API = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';

const generateEmbedding = async (text) => {
  try {
    const response = await fetch(HF_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text.substring(0, 512), options: { wait_for_model: true } }),
    });
    if (!response.ok) {
      console.error('[Similarity] HF API error:', await response.text());
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
    if (Array.isArray(data)) return data;
    return null;
  } catch (err) {
    console.error('[Similarity] Embedding error:', err.message);
    return null;
  }
};

const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const storeEmbedding = async (ideaId, embedding) => {
  try {
    await pool.query(
      `UPDATE ideas SET similarity_flags = $1 WHERE id = $2`,
      [JSON.stringify({ embedding, stored_at: new Date().toISOString() }), ideaId]
    );
    console.log(`[Similarity] Embedding stored for idea: ${ideaId}`);
  } catch (err) {
    console.error('[Similarity] Store error:', err.message);
  }
};

const checkSimilarity = async (ideaId, title, description) => {
  const text = `${title} ${description || ''}`.trim();
  const newEmbedding = await generateEmbedding(text);
  if (!newEmbedding) {
    console.warn('[Similarity] No embedding — skipping check');
    return { blocked: false, warning: false, score: 0, similar_ideas: [] };
  }

  await storeEmbedding(ideaId, newEmbedding);

  const { rows: ideas } = await pool.query(
    `SELECT id, title, similarity_flags FROM ideas
     WHERE id != $1 AND status = 'published'
     AND similarity_flags IS NOT NULL AND similarity_flags != '[]'`,
    [ideaId]
  );

  const results = [];
  for (const idea of ideas) {
    try {
      const flags = typeof idea.similarity_flags === 'string'
        ? JSON.parse(idea.similarity_flags) : idea.similarity_flags;
      const existingEmbedding = flags?.embedding;
      if (!existingEmbedding) continue;
      const score = cosineSimilarity(newEmbedding, existingEmbedding);
      if (score >= WARN_THRESHOLD) {
        results.push({ idea_id: idea.id, title: idea.title, similarity: Math.round(score * 100) / 100 });
      }
    } catch(e) { continue; }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  const topScore = results[0]?.similarity || 0;
  const blocked  = topScore >= BLOCK_THRESHOLD;
  const warning  = topScore >= WARN_THRESHOLD && !blocked;

  if (blocked) console.warn(`[Similarity] BLOCKED — score: ${topScore}`);
  else if (warning) console.warn(`[Similarity] WARNING — score: ${topScore}`);
  else console.log(`[Similarity] OK — score: ${topScore}`);

  return { blocked, warning, score: topScore, similar_ideas: results.slice(0, 5) };
};

const embedExistingIdea = async (ideaId, title) => {
  const embedding = await generateEmbedding(title);
  if (embedding) await storeEmbedding(ideaId, embedding);
  return embedding;
};

module.exports = {
  generateEmbedding, checkSimilarity, storeEmbedding,
  embedExistingIdea, cosineSimilarity, BLOCK_THRESHOLD, WARN_THRESHOLD,
};
