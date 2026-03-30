// Stats Handler - GET /api/stats
package handlers

import (
	"encoding/json"
	"net/http"
)

// StatsResponse represents the response for stats API.
type StatsResponse struct {
	Users int64 `json:"users"`
	Tasks int64 `json:"tasks"`
}

// HandleStats handles GET /api/stats
// Returns hardcoded statistics for the homepage.
func HandleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// Hardcoded statistics for demo purposes
	// In production, query these from the database
	resp := StatsResponse{
		Users: 12345,
		Tasks: 45678,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
