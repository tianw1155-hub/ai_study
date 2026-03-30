package models

import "time"

// User represents a user in the system (authenticated via GitHub OAuth).
type User struct {
	ID        string    `json:"id"`
	GitHubID  int64     `json:"github_id"`
	Login     string    `json:"login"`
	AvatarURL string    `json:"avatar_url"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}
