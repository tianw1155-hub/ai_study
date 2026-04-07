package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/devpilot/backend/internal/db"
	"github.com/devpilot/backend/internal/models"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type AuthHandler struct {
	githubClientID     string
	githubClientSecret string
	jwtSecret          string
}

func NewAuthHandler() *AuthHandler {
	return &AuthHandler{
		githubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		githubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		jwtSecret:          os.Getenv("JWT_SECRET"),
	}
}

type GitHubTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
}

type GitHubUserResponse struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"email"`
	Name      string `json:"name"`
}

// HandleGitHubCallback handles POST /api/auth/github
// Receives the GitHub OAuth code, exchanges for token, fetches user, signs JWT.
func (h *AuthHandler) HandleGitHubCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Code == "" {
		http.Error(w, "Missing code", http.StatusBadRequest)
		return
	}

	// 1. Exchange code for GitHub access token
	tokenResp, err := h.exchangeCodeForToken(req.Code)
	if err != nil {
		http.Error(w, "GitHub OAuth failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 2. Fetch GitHub user info
	ghUser, err := h.getGitHubUser(tokenResp.AccessToken)
	if err != nil {
		http.Error(w, "Failed to get GitHub user: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 3. Find or create user in database
	user, err := h.findOrCreateUser(ghUser)
	if err != nil {
		http.Error(w, "Failed to create user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 4. Sign JWT
	jwtToken, err := h.signJWT(user)
	if err != nil {
		http.Error(w, "Failed to sign token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": jwtToken,
		"user":  user,
	})
}

func (h *AuthHandler) exchangeCodeForToken(code string) (*GitHubTokenResponse, error) {
	payload := map[string]string{
		"client_id":     h.githubClientID,
		"client_secret": h.githubClientSecret,
		"code":          code,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", "https://github.com/login/oauth/access_token", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response body as raw bytes first
	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body failed: %w", err)
	}

	var tokenResp GitHubTokenResponse
	if err := json.Unmarshal(rawBody, &tokenResp); err != nil {
		return nil, fmt.Errorf("decode failed: %w", err)
	}

	// GitHub returns error as JSON fields even on 200, e.g. {"error":"bad_verification_code","error_description":"..."}
	if tokenResp.AccessToken == "" {
		var errResp struct {
			Error           string `json:"error"`
			ErrorDescription string `json:"error_description"`
		}
		if err := json.Unmarshal(rawBody, &errResp); err == nil && errResp.Error != "" {
			return nil, fmt.Errorf("GitHub OAuth error: %s (%s)", errResp.Error, errResp.ErrorDescription)
		}
		return nil, fmt.Errorf("no access token returned")
	}

	return &tokenResp, nil
}

func (h *AuthHandler) getGitHubUser(accessToken string) (*GitHubUserResponse, error) {
	req, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var user GitHubUserResponse
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("decode failed: %w", err)
	}

	return &user, nil
}

func (h *AuthHandler) findOrCreateUser(ghUser *GitHubUserResponse) (*models.User, error) {
	pool := db.Pool()
	if pool == nil {
		// Fallback: return a mock user if DB not initialized
		return &models.User{
			ID:        uuid.New().String(),
			GitHubID:  ghUser.ID,
			Login:     ghUser.Login,
			AvatarURL: ghUser.AvatarURL,
			Email:     ghUser.Email,
			CreatedAt: time.Now(),
		}, nil
	}

	ctx := context.Background()

	// Try to find existing user
	var user models.User
	err := pool.QueryRow(ctx,
		"SELECT id, github_id, login, avatar_url, email, created_at FROM users WHERE github_id = $1",
		ghUser.ID,
	).Scan(&user.ID, &user.GitHubID, &user.Login, &user.AvatarURL, &user.Email, &user.CreatedAt)

	if err == nil {
		// User exists, return it
		return &user, nil
	}

	// User not found — create new user
	user = models.User{
		ID:        uuid.New().String(),
		GitHubID:  ghUser.ID,
		Login:     ghUser.Login,
		AvatarURL: ghUser.AvatarURL,
		Email:     ghUser.Email,
		CreatedAt: time.Now(),
	}

	_, err = pool.Exec(ctx,
		"INSERT INTO users (id, github_id, login, avatar_url, email) VALUES ($1, $2, $3, $4, $5)",
		user.ID, user.GitHubID, user.Login, user.AvatarURL, user.Email,
	)
	if err != nil {
		return nil, fmt.Errorf("insert failed: %w", err)
	}

	return &user, nil
}

func (h *AuthHandler) signJWT(user *models.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id":   user.ID,
		"github_id": strconv.FormatInt(user.GitHubID, 10),
		"login":     user.Login,
		"exp":       time.Now().Add(7 * 24 * time.Hour).Unix(), // 7 days
		"iat":       time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}

// RequireAuth is a middleware that validates JWT and extracts user info.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || len(authHeader) < 8 || authHeader[:7] != "Bearer " {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		tokenString := authHeader[7:]
		jwtSecret := os.Getenv("JWT_SECRET")

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		// Store claims in context for handlers
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			r = r.WithContext(context.WithValue(r.Context(), "claims", claims))
		}

		next.ServeHTTP(w, r)
	})
}
