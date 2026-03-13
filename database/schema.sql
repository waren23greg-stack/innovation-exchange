CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  username         VARCHAR(50)  NOT NULL,
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  kyc_status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (kyc_status IN ('pending','verified','rejected')),
  reputation_score NUMERIC(5,2) NOT NULL DEFAULT 100.0,
  is_suspended     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ideas (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            VARCHAR(500) NOT NULL,
  category         VARCHAR(100),
  asking_price_usd NUMERIC(15,2),
  idea_fingerprint VARCHAR(64)  NOT NULL UNIQUE,
  innovation_score NUMERIC(5,2),
  status           VARCHAR(20)  NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','published','under_offer','sold','licensed')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  published_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ideas_creator  ON ideas(creator_id);
CREATE INDEX IF NOT EXISTS idx_ideas_status   ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);

CREATE TABLE IF NOT EXISTS cid_layers (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id           UUID         NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  layer_number      INT          NOT NULL CHECK (layer_number BETWEEN 1 AND 5),
  layer_name        VARCHAR(100) NOT NULL,
  content_plain     TEXT,
  unlock_conditions JSONB        NOT NULL DEFAULT '{}',
  unlock_count      INT          NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (idea_id, layer_number)
);

CREATE TABLE IF NOT EXISTS disclosure_events (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id          UUID         NOT NULL REFERENCES ideas(id),
  layer_id         UUID         NOT NULL REFERENCES cid_layers(id),
  viewer_id        UUID         NOT NULL REFERENCES users(id),
  event_type       VARCHAR(50)  NOT NULL
                   CHECK (event_type IN ('nda_signed','layer_unlocked','document_viewed','screenshot_attempt','escrow_deposited')),
  viewer_watermark VARCHAR(128),
  nda_envelope_id  VARCHAR(255),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE RULE disclosure_no_update AS ON UPDATE TO disclosure_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE disclosure_no_delete AS ON DELETE TO disclosure_events DO INSTEAD NOTHING;

CREATE TABLE IF NOT EXISTS idea_ownership_ledger (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id     UUID        NOT NULL REFERENCES ideas(id),
  owner_id    UUID        NOT NULL REFERENCES users(id),
  event_type  VARCHAR(50) NOT NULL
              CHECK (event_type IN ('creation','transfer','licensing','royalty_set','offer_received')),
  details     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iol_idea  ON idea_ownership_ledger(idea_id);
CREATE INDEX IF NOT EXISTS idx_iol_owner ON idea_ownership_ledger(owner_id);