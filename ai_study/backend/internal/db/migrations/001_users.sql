-- Migration 001: Create users table for GitHub OAuth
-- Run this migration against your PostgreSQL database

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id BIGINT UNIQUE NOT NULL,
    login VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
