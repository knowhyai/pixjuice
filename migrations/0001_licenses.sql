-- PixJuice VIP licenses. Free-tier D1. No raw webhook payloads, card data or
-- private keys are stored here.
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,          -- Waffo delivery UUID, dedupes redeliveries
  event_type TEXT NOT NULL,
  order_id TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE licenses (
  key TEXT PRIMARY KEY,          -- PJV-XXXX-XXXX-XXXX-XXXX shown to the buyer
  email TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('lifetime', 'yearly', 'monthly')),
  status TEXT NOT NULL DEFAULT 'active',  -- active | canceled | revoked
  order_id TEXT,                 -- Waffo order; upserts refresh the same key
  expires_at TEXT,               -- ISO 8601; NULL = lifetime
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX licenses_order ON licenses(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX licenses_email ON licenses(email);

-- A license is usable while active and (for time-limited plans) unexpired.
CREATE VIEW valid_licenses AS
SELECT * FROM licenses
WHERE status = 'active'
  AND (expires_at IS NULL OR expires_at > datetime('now'));
