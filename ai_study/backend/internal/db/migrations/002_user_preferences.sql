-- Migration: User preferences (model + API key config)
-- Created: 2026-03-31

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id       VARCHAR(255) PRIMARY KEY,
    model         VARCHAR(255) NOT NULL DEFAULT 'gpt-4o',
    api_key       TEXT        NOT NULL,
    language      VARCHAR(50) NOT NULL DEFAULT 'python',
    framework     VARCHAR(255) NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_preferences IS 'Stores per-user AI model configuration and API keys';
COMMENT ON COLUMN user_preferences.user_id IS 'References users.id or GitHub login';
COMMENT ON COLUMN user_preferences.api_key IS 'Encrypted or plaintext API key (per-user, not shared)';
