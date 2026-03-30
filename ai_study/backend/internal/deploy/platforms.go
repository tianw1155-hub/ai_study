// Deployment platform integrations for Vercel and Render.
package deploy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Platform defines the interface for deployment platforms.
type Platform interface {
	TriggerDeploy(ctx context.Context, req DeployRequest) (*DeployResult, error)
	GetDeployStatus(ctx context.Context, deploymentID string) (*DeployStatus, error)
	AbortDeploy(ctx context.Context, deploymentID string) error
	GetLogs(ctx context.Context, deploymentID string) ([]string, error)
}

// DeployRequest contains the parameters for triggering a deployment.
type DeployRequest struct {
	RepoURL    string
	Branch     string
	CommitSHA  string
	Type       string // "frontend" or "backend"
	TaskID     string
}

// DeployResult contains the result of a deployment trigger.
type DeployResult struct {
	DeploymentID string
	PreviewURL   string
	Status       string
}

// DeployStatus contains the current status of a deployment.
type DeployStatus struct {
	Status    string
	Logs      []string
	URL       string
	CreatedAt time.Time
}

// VercelClient implements Platform for Vercel deployments.
type VercelClient struct {
	token      string
	teamID     string
	httpClient *http.Client
}

// NewVercelClient creates a new Vercel API client.
func NewVercelClient() *VercelClient {
	token := os.Getenv("VERCEL_TOKEN")
	teamID := os.Getenv("VERCEL_TEAM_ID")
	return &VercelClient{
		token:      token,
		teamID:     teamID,
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// TriggerDeploy triggers a new deployment on Vercel.
func (v *VercelClient) TriggerDeploy(ctx context.Context, req DeployRequest) (*DeployResult, error) {
	url := "https://api.vercel.com/v13/deployments"

	// Build the request body
	payload := map[string]interface{}{
		"name":          fmt.Sprintf("devpilot-%s", req.TaskID),
		"gitSource":     map[string]string{"type": "github"},
		"target":        "preview",
		"projectSettings": map[string]interface{}{
			"framework":  nil,
			"buildCommand": v.getBuildCommand(req.Type),
			"outputDirectory": v.getOutputDirectory(req.Type),
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Authorization", "Bearer "+v.token)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := v.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("vercel API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var deployResp struct {
		ID     string `json:"id"`
		URL    string `json:"url"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(respBody, &deployResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	previewURL := ""
	if deployResp.URL != "" {
		previewURL = "https://" + deployResp.URL
	}

	return &DeployResult{
		DeploymentID: deployResp.ID,
		PreviewURL:   previewURL,
		Status:       deployResp.Status,
	}, nil
}

// GetDeployStatus fetches the current status of a Vercel deployment.
func (v *VercelClient) GetDeployStatus(ctx context.Context, deploymentID string) (*DeployStatus, error) {
	url := fmt.Sprintf("https://api.vercel.com/v13/deployments/%s", deploymentID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+v.token)

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("vercel API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var deployResp struct {
		ID        string `json:"id"`
		URL       string `json:"url"`
		Status    string `json:"status"`
		CreatedAt string `json:"createdAt"`
	}
	if err := json.Unmarshal(respBody, &deployResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	status := "idle"
	switch deployResp.Status {
	case "BUILDING", "INITIALIZING":
		status = "deploying"
	case "READY":
		status = "success"
	case "ERROR", "CANCELED":
		status = "failed"
	}

	return &DeployStatus{
		Status: status,
		URL:    deployResp.URL,
	}, nil
}

// AbortDeploy aborts a Vercel deployment.
func (v *VercelClient) AbortDeploy(ctx context.Context, deploymentID string) error {
	url := fmt.Sprintf("https://api.vercel.com/v13/deployments/%s", deploymentID)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+v.token)

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 && resp.StatusCode != 404 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("vercel API error: %d - %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// GetLogs fetches deployment logs from Vercel.
func (v *VercelClient) GetLogs(ctx context.Context, deploymentID string) ([]string, error) {
	url := fmt.Sprintf("https://api.vercel.com/v13/deployments/%s/events", deploymentID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+v.token)

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("vercel API error: %d - %s", resp.StatusCode, string(respBody))
	}

	// Vercel returns NDJSON (newline-delimited JSON)
	var logs []string
	decoder := json.NewDecoder(resp.Body)
	for decoder.More() {
		var event struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if err := decoder.Decode(&event); err == nil {
			if event.Text != "" {
				logs = append(logs, event.Text)
			}
		}
	}

	return logs, nil
}

func (v *VercelClient) getBuildCommand(deployType string) string {
	if deployType == "frontend" {
		return "npm run build"
	}
	return "go build -o server ./cmd/server"
}

func (v *VercelClient) getOutputDirectory(deployType string) string {
	if deployType == "frontend" {
		return ".next"
	}
	return "."
}

// RenderClient implements Platform for Render deployments.
type RenderClient struct {
	apiKey   string
	httpClient *http.Client
}

// NewRenderClient creates a new Render API client.
func NewRenderClient() *RenderClient {
	apiKey := os.Getenv("RENDER_API_KEY")
	return &RenderClient{
		apiKey:   apiKey,
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// TriggerDeploy triggers a new deployment on Render.
func (r *RenderClient) TriggerDeploy(ctx context.Context, req DeployRequest) (*DeployResult, error) {
	url := "https://api.render.com/v1/blueprints"

	payload := map[string]interface{}{
		"serviceId":   fmt.Sprintf("devpilot-%s", req.TaskID),
		"type":        "web_service",
		"name":        fmt.Sprintf("devpilot-%s", req.TaskID),
		"repo":        req.RepoURL,
		"branch":      req.Branch,
		"region":      "oregon",
		"instanceType": "free",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Authorization", "Bearer "+r.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("render API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var deployResp struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	}
	if err := json.Unmarshal(respBody, &deployResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &DeployResult{
		DeploymentID: deployResp.ID,
		PreviewURL:   fmt.Sprintf("https://%s.onrender.com", deployResp.Slug),
		Status:       "live",
	}, nil
}

// GetDeployStatus fetches the current status of a Render deployment.
func (r *RenderClient) GetDeployStatus(ctx context.Context, deploymentID string) (*DeployStatus, error) {
	url := fmt.Sprintf("https://api.render.com/v1/services/%s", deploymentID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+r.apiKey)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("render API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var serviceResp struct {
		ID     string `json:"id"`
		Slug   string `json:"slug"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(respBody, &serviceResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	status := "idle"
	switch strings.ToLower(serviceResp.Status) {
	case "building", "deploying":
		status = "deploying"
	case "live", "active":
		status = "success"
	case "errored", "failed":
		status = "failed"
	}

	return &DeployStatus{
		Status: status,
		URL:    fmt.Sprintf("https://%s.onrender.com", serviceResp.Slug),
	}, nil
}

// AbortDeploy Render does not support aborting deployments via API.
// This is a no-op for Render.
func (r *RenderClient) AbortDeploy(ctx context.Context, deploymentID string) error {
	// Render doesn't support deployment abort
	return fmt.Errorf("render does not support deployment abort via API")
}

// GetLogs fetches deployment logs from Render.
func (r *RenderClient) GetLogs(ctx context.Context, deploymentID string) ([]string, error) {
	url := fmt.Sprintf("https://api.render.com/v1/services/%s/logs", deploymentID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+r.apiKey)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("render API error: %d - %s", resp.StatusCode, string(respBody))
	}

	var logsResp struct {
		Lines []struct {
			Message string `json:"message"`
		} `json:"lines"`
	}
	if err := json.Unmarshal(respBody, &logsResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	logs := make([]string, len(logsResp.Lines))
	for i, line := range logsResp.Lines {
		logs[i] = line.Message
	}

	return logs, nil
}

// GetPlatform returns the appropriate platform client.
func GetPlatform(platformName string) Platform {
	switch strings.ToLower(platformName) {
	case "vercel":
		return NewVercelClient()
	case "render":
		return NewRenderClient()
	default:
		return nil
	}
}
