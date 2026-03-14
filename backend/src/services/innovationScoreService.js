const pool = require('../config/db');

const computeNovelty = (similarityScore) => {
  return Math.round(Math.max(0, 1 - similarityScore) * 100);
};

const computeCompleteness = async (ideaId) => {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS layer_count FROM cid_layers WHERE idea_id = $1', [ideaId]
  );
  return Math.round((parseInt(rows[0].layer_count) / 5) * 100);
};

const computeCategoryRelevance = (idea) => {
  let score = 0;
  if (idea.category) score += 50;
  if (idea.asking_price_usd && idea.asking_price_usd > 0) score += 30;
  if (idea.title && idea.title.length > 10) score += 20;
  return Math.min(100, score);
};

const computePriceSignal = (askingPriceUsd) => {
  const price = parseFloat(askingPriceUsd || 0);
  if (price <= 0)      return 0;
  if (price < 100)     return 20;
  if (price < 1000)    return 40;
  if (price < 10000)   return 60;
  if (price < 100000)  return 80;
  if (price < 1000000) return 100;
  return 90;
};

const computeFreshness = (createdAt) => {
  const ageInDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageInDays < 7)   return 100;
  if (ageInDays < 30)  return 80;
  if (ageInDays < 90)  return 60;
  if (ageInDays < 180) return 40;
  return 20;
};

const computeInnovationScore = async (ideaId) => {
  const { rows } = await pool.query('SELECT * FROM ideas WHERE id = $1', [ideaId]);
  if (!rows[0]) throw new Error('Idea not found');
  const idea = rows[0];

  let similarityScore = 0;
  try {
    const flags = typeof idea.similarity_flags === 'string'
      ? JSON.parse(idea.similarity_flags) : idea.similarity_flags;
    if (Array.isArray(flags) && flags.length > 0) {
      similarityScore = flags[0].similarity || 0;
    }
  } catch(e) {}

  const novelty      = computeNovelty(similarityScore);
  const completeness = await computeCompleteness(ideaId);
  const relevance    = computeCategoryRelevance(idea);
  const priceSignal  = computePriceSignal(idea.asking_price_usd);
  const freshness    = computeFreshness(idea.created_at);

  const score = Math.round(
    novelty      * 0.40 +
    completeness * 0.30 +
    relevance    * 0.15 +
    priceSignal  * 0.10 +
    freshness    * 0.05
  );

  const breakdown = {
    novelty:      { score: novelty,      weight: '40%' },
    completeness: { score: completeness, weight: '30%' },
    relevance:    { score: relevance,    weight: '15%' },
    price_signal: { score: priceSignal,  weight: '10%' },
    freshness:    { score: freshness,    weight: '5%'  },
    final: score,
  };

  await pool.query('UPDATE ideas SET innovation_score = $1 WHERE id = $2', [score, ideaId]);
  console.log(`[Score] Idea ${ideaId} — Innovation Score: ${score}/100`);
  return breakdown;
};

const getScoreLabel = (score) => {
  if (score >= 90) return { label: 'Exceptional', color: 'gold' };
  if (score >= 75) return { label: 'Strong',      color: 'green' };
  if (score >= 60) return { label: 'Good',        color: 'cyan' };
  if (score >= 40) return { label: 'Average',     color: 'yellow' };
  return           { label: 'Weak',          color: 'red' };
};

module.exports = { computeInnovationScore, getScoreLabel };
