// GitHub API client for repository operations.
package github

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/devpilot/backend/internal/models"
)

// Client wraps the GitHub API.
type Client struct {
	token   string
	httpClient *http.Client
	owner   string
	repo    string
}

// NewClient creates a new GitHub API client.
func NewClient(owner, repo string) *Client {
	token := os.Getenv("GITHUB_TOKEN")
	return &Client{
		token:   token,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		owner:   owner,
		repo:    repo,
	}
}

// GetRepoInfo fetches repository information from GitHub API.
func (c *Client) GetRepoInfo(ctx context.Context) (*models.GitHubRepoInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s", c.owner, c.repo)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	var repoData struct {
		DefaultBranch string `json:"default_branch"`
		HTMLURL       string `json:"html_url"`
	}
	if err := json.Unmarshal(resp, &repoData); err != nil {
		return nil, fmt.Errorf("failed to parse repo info: %w", err)
	}

	// Get latest commit SHA
	latestSHA, err := c.GetLatestCommitSHA(ctx, repoData.DefaultBranch)
	if err != nil {
		// Fallback: try to get from commits list
		latestSHA, _ = c.GetLatestCommitFromList(ctx, repoData.DefaultBranch)
	}

	info := &models.GitHubRepoInfo{
		RepoURL:         repoData.HTMLURL,
		DefaultBranch:   repoData.DefaultBranch,
		LatestCommitSHA: latestSHA,
		CloneCommand:    fmt.Sprintf("git clone https://github.com/%s/%s.git", c.owner, c.repo),
		Owner:           c.owner,
		Repo:            c.repo,
	}

	return info, nil
}

// GetLatestCommitSHA fetches the latest commit SHA for a branch.
func (c *Client) GetLatestCommitSHA(ctx context.Context, branch string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/refs/heads/%s", c.owner, c.repo, branch)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}

	var refData struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := json.Unmarshal(resp, &refData); err != nil {
		return "", fmt.Errorf("failed to parse ref: %w", err)
	}

	return refData.Object.SHA, nil
}

// GetCommitCount returns the number of commits between two SHAs.
func (c *Client) GetCommitCount(ctx context.Context, baseSHA, headSHA string) (int, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/compare/%s...%s", c.owner, c.repo, baseSHA, headSHA)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return 0, err
	}

	var compare struct {
		TotalCommits int `json:"total_commits"`
	}
	if err := json.Unmarshal(resp, &compare); err != nil {
		return 0, fmt.Errorf("failed to parse compare: %w", err)
	}

	return compare.TotalCommits, nil
}

// GetBranchRef fetches the current SHA of a branch ref.
func (c *Client) GetBranchRef(ctx context.Context, branch string) (string, error) {
	return c.GetLatestCommitSHA(ctx, branch)
}

// UpdateBranchRef updates a branch ref to point to a new SHA (safe, non-force).
func (c *Client) UpdateBranchRef(ctx context.Context, branch, sha string) error {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/refs/heads/%s", c.owner, c.repo, branch)

	payload := map[string]string{"sha": sha}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	_, err = c.doRequest(req)
	return err
}

// GetLatestCommitFromList fetches the latest commit SHA from commits list.
func (c *Client) GetLatestCommitFromList(ctx context.Context, branch string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/commits?sha=%s&per_page=1", c.owner, c.repo, branch)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}

	var commits []struct {
		SHA string `json:"sha"`
	}
	if err := json.Unmarshal(resp, &commits); err != nil {
		return "", fmt.Errorf("failed to parse commits: %w", err)
	}

	if len(commits) > 0 {
		return commits[0].SHA, nil
	}
	return "", fmt.Errorf("no commits found")
}

// GetFileTree fetches the repository file tree recursively.
func (c *Client) GetFileTree(ctx context.Context, treeSHA string) ([]models.FileTreeNode, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/trees/%s?recursive=1", c.owner, c.repo, treeSHA)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	var treeData struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
			Size int    `json:"size"`
			SHA  string `json:"sha"`
		} `json:"tree"`
	}
	if err := json.Unmarshal(resp, &treeData); err != nil {
		return nil, fmt.Errorf("failed to parse tree: %w", err)
	}

	// Filter out .gitignore entries
	nodes := make([]models.FileTreeNode, 0, len(treeData.Tree))
	for _, item := range treeData.Tree {
		if item.Path != ".gitignore" && !strings.HasPrefix(item.Path, ".git/") {
			nodes = append(nodes, models.FileTreeNode{
				Path: item.Path,
				Type: item.Type,
				Size: item.Size,
				SHA:  item.SHA,
			})
		}
	}

	return nodes, nil
}

// GetFileContent fetches a single file's content from GitHub.
func (c *Client) GetFileContent(ctx context.Context, path, ref string) ([]byte, int, error) {
	// Use raw.githubusercontent.com for file content
	url := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", c.owner, c.repo, ref, path)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	// Don't set Accept header for raw content
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, 0, fmt.Errorf("file not found: %s", path)
	}

	if resp.StatusCode == http.StatusForbidden {
		return nil, 0, fmt.Errorf("access forbidden: %s", path)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read body: %w", err)
	}

	size := len(body)

	// Truncate if > 1MB (approximately 1 million characters)
	if size > 1<<20 {
		// Find newline near line 1000 to avoid cutting in middle of line
		lines := strings.Split(string(body[:min(len(body), 50000)]), "\n")
		if len(lines) > 1000 {
			body = []byte(strings.Join(lines[:1000], "\n") + "\n---\n[File truncated: showing first 1000 lines]")
			size = len(body)
		}
	}

	return body, size, nil
}

// GetCommits fetches the recent commits from GitHub.
func (c *Client) GetCommits(ctx context.Context, perPage int) ([]models.GitHubCommit, error) {
	if perPage <= 0 || perPage > 100 {
		perPage = 10
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/commits?per_page=%d", c.owner, c.repo, perPage)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	var commits []models.GitHubCommit
	if err := json.Unmarshal(resp, &commits); err != nil {
		return nil, fmt.Errorf("failed to parse commits: %w", err)
	}

	return commits, nil
}

// CreateRevertCommit creates a new revert commit using GitHub API.
// This uses the git/trailers endpoint to create a revert commit.
func (c *Client) CreateRevertCommit(ctx context.Context, commitSHA, branch string) (string, error) {
	// First, get the commit details to create a revert
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/git/trailers", c.owner, c.repo)

	payload := map[string]interface{}{
		"message": fmt.Sprintf("Revert \"%s\"", commitSHA[:7]),
		"tree":    commitSHA,
		"parents": []string{commitSHA},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	// Note: GitHub doesn't have a direct "revert" API. The proper way is to use
	// POST /repos/{owner}/{repo}/pulls to create a PR with revert.
	// For this implementation, we simulate by creating a commit that undoes changes.
	// The actual revert logic should be done via git operations or GitHub CLI.

	return "", fmt.Errorf("revert requires manual git operation or PR creation")
}

// GetArchivedVersion fetches an archived PRD version from docs/archive/.
func (c *Client) GetArchivedVersion(ctx context.Context, archivePath string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", c.owner, c.repo, archivePath)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}

	var contentData struct {
		Content string `json:"content"`
		Encoding string `json:"encoding"`
	}
	if err := json.Unmarshal(resp, &contentData); err != nil {
		return "", fmt.Errorf("failed to parse content: %w", err)
	}

	// Decode base64 content
	if contentData.Encoding == "base64" {
		decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(contentData.Content, "\n", ""))
		if err != nil {
			return "", fmt.Errorf("failed to decode content: %w", err)
		}
		return string(decoded), nil
	}

	return contentData.Content, nil
}

// doRequest executes an HTTP request with rate limit handling.
func (c *Client) doRequest(req *http.Request) ([]byte, error) {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Handle rate limiting
	if resp.StatusCode == http.StatusTooManyRequests {
		// Check for rate limit reset header
		resetStr := resp.Header.Get("X-RateLimit-Reset")
		if resetStr != "" {
			resetTime, err := strconv.ParseInt(resetStr, 10, 64)
			if err == nil {
				waitDuration := time.Until(time.Unix(resetTime, 0)) + time.Second
				if waitDuration > 0 && waitDuration < 2*time.Minute {
					time.Sleep(waitDuration)
					return c.doRequest(req)
				}
			}
		}
		// Fallback: wait 60 seconds
		time.Sleep(60 * time.Second)
		return c.doRequest(req)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status: %d, body: %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
