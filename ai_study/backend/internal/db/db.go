// Database connection package
package db

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

var pool *pgxpool.Pool

// Init initializes the database connection pool.
func Init(ctx context.Context) error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://devpilot:devpilot_secret@localhost:5432/devpilot?sslmode=disable"
	}

	var err error
	pool, err = pgxpool.New(ctx, dsn)
	if err != nil {
		return fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	return nil
}

// Pool returns the database connection pool.
func Pool() *pgxpool.Pool {
	return pool
}

// Close closes the database connection pool.
func Close() {
	if pool != nil {
		pool.Close()
	}
}

// InitMemoriesTable creates the memories table if it doesn't exist.
func InitMemoriesTable(ctx context.Context) error {
	_, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS memories (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id VARCHAR(100),
		type VARCHAR(30) NOT NULL,
		content TEXT NOT NULL,
		summary VARCHAR(500),
		keywords VARCHAR(255),
		created_at TIMESTAMP DEFAULT NOW(),
		last_used_at TIMESTAMP DEFAULT NOW(),
		use_count INT DEFAULT 0
	)`)
	return err
}
