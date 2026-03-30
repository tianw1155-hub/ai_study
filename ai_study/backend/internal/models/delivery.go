// Delivery models for PRD version management, GitHub integration, and deployment tracking.
package models

import "time"

// PRDVersion represents a PRD document version.
type PRDVersion struct {
	ID        string    `json:"id"`
	TaskID    string    `json:"task_id"`
	Version   string    `json:"version"`
	Content   string    `json:"content"`
	CommitSHA string    `json:"commit_sha"`
	IsCurrent bool      `json:"is_current"`
	CreatedAt time.Time `json:"created_at"`
}

// GitHubRepoInfo represents GitHub repository metadata.
type GitHubRepoInfo struct {
	RepoURL         string `json:"repo_url"`
	DefaultBranch   string `json:"default_branch"`
	LatestCommitSHA string `json:"latest_commit_sha"`
	CloneCommand    string `json:"clone_command"`
	Owner           string `json:"owner"`
	Repo            string `json:"repo"`
}

// FileTreeNode represents a node in the GitHub file tree.
type FileTreeNode struct {
	Path    string `json:"path"`
	Type    string `json:"type"` // "tree" or "blob"
	Size    int    `json:"size"`
	SHA     string `json:"sha"`
}

// Deployment represents a deployment record.
type Deployment struct {
	ID         string    `json:"id"`
	TaskID     string    `json:"task_id"`
	Platform   string    `json:"platform"` // vercel/render
	Status     string    `json:"status"`   // idle/deploying/success/failed/aborted
	CommitSHA  string    `json:"commit_sha"`
	PreviewURL string    `json:"preview_url"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// RollbackLog represents a rollback operation log entry.
type RollbackLog struct {
	ID              string     `json:"id"`
	TaskID          string     `json:"task_id"`
	TargetVersion   string     `json:"target_version"`
	Step            int        `json:"step"`
	StepName        string     `json:"step_name"`
	Status          string     `json:"status"` // pending/completed/failed
	ErrorMessage    string     `json:"error_message,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
	RetryCount      int        `json:"retry_count"`
	GitHubRevertSHA string     `json:"github_revert_sha,omitempty"`
	DeploymentID    string     `json:"deployment_id,omitempty"`
	LastRollbackAt  *time.Time `json:"last_rollback_at,omitempty"`
}

// DeployRequest represents the request body for triggering a deployment.
type DeployRequest struct {
	Platform string `json:"platform"` // "vercel" or "render"
	Type     string `json:"type"`     // "frontend" or "backend"
}

// DeployResponse represents the response for a deployment trigger.
type DeployResponse struct {
	DeploymentID string `json:"deployment_id"`
	PreviewURL   string `json:"preview_url"`
	Status       string `json:"status"`
}

// DeployStatusResponse represents the response for deployment status query.
type DeployStatusResponse struct {
	Status string   `json:"status"` // idle/deploying/success/failed
	Logs   []string `json:"logs"`
}

// RollbackRequest represents the request body for a rollback.
type RollbackRequest struct {
	TargetVersion string `json:"target_version"` // version string to rollback to
}

// GitHubFileContent represents file content from GitHub.
type GitHubFileContent struct {
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
	Size     int    `json:"size"`
	Path     string `json:"path"`
}

// GitHubCommit represents a commit from GitHub API.
type GitHubCommit struct {
	SHA    string `json:"sha"`
	Commit struct {
		Message string    `json:"message"`
		Author  struct {
			Name  string    `json:"name"`
			Date  time.Time `json:"date"`
		} `json:"author"`
	} `json:"commit"`
	HTMLURL string `json:"html_url"`
}

// PRDCurrentResponse represents the response for GET /api/delivery/:task_id/prd
type PRDCurrentResponse struct {
	CurrentVersion *PRDVersion   `json:"current_version"`
	Versions       []PRDVersion  `json:"versions"`
}

// PRDRollbackRequest represents the request for PRD rollback.
type PRDRollbackRequest struct {
	TargetVersionID string `json:"target_version_id"`
}
