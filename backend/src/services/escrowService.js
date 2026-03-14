// src/services/escrowService.js
// Escrow service for CID Layer 3+ unlock
// Stub mode for development — swap in Stripe/Flutterwave/Paystack for production

const pool = require('../config/db');
const crypto = require('crypto');

// ─── Generate a payment reference ────────────────────────────────────────────
const generatePaymentRef = (ideaId, userId) => {
  return `IX_${crypto.createHash('sha256')
    .update(`${ideaId}:${userId}:${Date.now()}`)
    .digest('hex').substring(0, 16).toUpperCase()}`;
};

// ─── Create escrow payment hold ───────────────────────────────────────────────
const createEscrowHold = async ({ ideaId, userId, amountUsd, layerNumber }) => {
  const paymentRef = generatePaymentRef(ideaId, userId);

  // In production: integrate Stripe/Flutterwave/Paystack here
  // For now: stub a successful payment hold
  if (process.env.STRIPE_SECRET_KEY === 'sk_test_stub' ||
      !process.env.STRIPE_SECRET_KEY) {
    console.log(`[Escrow] STUB payment hold — ref: ${paymentRef} amount: $${amountUsd}`);

    // Log escrow deposit to disclosure_events
    await pool.query(
      `INSERT INTO disclosure_events
        (idea_id, layer_id, viewer_id, event_type, viewer_watermark)
       SELECT $1, cl.id, $2, 'escrow_deposited', $3
       FROM cid_layers cl
       WHERE cl.idea_id = $1 AND cl.layer_number = $4
       LIMIT 1`,
      [ideaId, userId, paymentRef, layerNumber]
    );

    return {
      success:     true,
      payment_ref: paymentRef,
      amount_usd:  amountUsd,
      status:      'held',
      stub:        true,
      message:     'Escrow hold created (stub mode)',
      provider:    'stub',
    };
  }

  // ── Real Stripe integration (uncomment when ready) ────────────────────────
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // const paymentIntent = await stripe.paymentIntents.create({
  //   amount:   Math.round(amountUsd * 100), // cents
  //   currency: 'usd',
  //   capture_method: 'manual', // hold, don't capture yet
  //   metadata: { ideaId, userId, layerNumber, paymentRef },
  // });
  // return {
  //   success:          true,
  //   payment_ref:      paymentRef,
  //   client_secret:    paymentIntent.client_secret,
  //   payment_intent_id: paymentIntent.id,
  //   amount_usd:       amountUsd,
  //   status:           'held',
  // };
};

// ─── Release escrow to seller ─────────────────────────────────────────────────
const releaseEscrow = async ({ paymentRef, ideaId, toUserId }) => {
  console.log(`[Escrow] Releasing payment ${paymentRef} to user ${toUserId}`);
  // In production: stripe.paymentIntents.capture(paymentIntentId)
  return {
    success:     true,
    payment_ref: paymentRef,
    status:      'released',
    stub:        true,
  };
};

// ─── Refund escrow to buyer ───────────────────────────────────────────────────
const refundEscrow = async ({ paymentRef }) => {
  console.log(`[Escrow] Refunding payment ${paymentRef}`);
  // In production: stripe.refunds.create({ payment_intent: paymentIntentId })
  return {
    success:     true,
    payment_ref: paymentRef,
    status:      'refunded',
    stub:        true,
  };
};

// ─── Check if user has paid escrow for a layer ────────────────────────────────
const hasEscrowDeposit = async (ideaId, userId, layerNumber) => {
  const { rows } = await pool.query(
    `SELECT de.id FROM disclosure_events de
     JOIN cid_layers cl ON cl.id = de.layer_id
     WHERE de.idea_id = $1
       AND de.viewer_id = $2
       AND de.event_type = 'escrow_deposited'
       AND cl.layer_number = $3
     LIMIT 1`,
    [ideaId, userId, layerNumber]
  );
  return rows.length > 0;
};

module.exports = {
  createEscrowHold,
  releaseEscrow,
  refundEscrow,
  hasEscrowDeposit,
  generatePaymentRef,
};
