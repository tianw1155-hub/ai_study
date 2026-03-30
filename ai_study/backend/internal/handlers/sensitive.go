// Sensitive Word Handler - POST /api/sensitive/check
package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
)

// SensitiveCheckRequest represents the request body for sensitive word check.
type SensitiveCheckRequest struct {
	Text string `json:"text"`
}

// SensitiveCheckResponse represents the response for sensitive word check.
type SensitiveCheckResponse struct {
	Pass     bool     `json:"pass"`
	Keywords []string `json:"keywords"`
}

// sensitiveWords is a list of sensitive words for content filtering.
// In production, use a Trie data structure for better performance.
var sensitiveWords = []string{
	// Political sensitive terms (examples - for demonstration)
	"台独", "藏独", "疆独", "分裂",
	// Profanity (basic examples)
	"傻逼", "混蛋", "白痴",
	// Illegal content indicators
	"毒品", "赌博", "诈骗",
	// Other sensitive categories
	"暴力", "恐怖",
}

// HandleSensitiveCheck handles POST /api/sensitive/check
// Checks text for sensitive words and returns pass/fail with detected keywords.
func HandleSensitiveCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SensitiveCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid JSON body"}`, http.StatusBadRequest)
		return
	}

	if req.Text == "" {
		http.Error(w, `{"error": "Text field is required"}`, http.StatusBadRequest)
		return
	}

	// Check for sensitive words
	detected := checkSensitiveWords(req.Text)

	resp := SensitiveCheckResponse{
		Pass:     len(detected) == 0,
		Keywords: detected,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// checkSensitiveWords checks text against the sensitive word list.
// Returns a list of detected sensitive words.
func checkSensitiveWords(text string) []string {
	var detected []string
	textLower := strings.ToLower(text)

	for _, word := range sensitiveWords {
		// Check for exact match (case-insensitive)
		if strings.Contains(textLower, strings.ToLower(word)) {
			// Avoid duplicate entries
			found := false
			for _, d := range detected {
				if d == word {
					found = true
					break
				}
			}
			if !found {
				detected = append(detected, word)
			}
		}
	}

	return detected
}

// ContainsSensitiveWord checks if text contains any sensitive word.
func ContainsSensitiveWord(text string) bool {
	detected := checkSensitiveWords(text)
	return len(detected) > 0
}

// GetSensitiveWords returns all sensitive words (for admin purposes).
func GetSensitiveWords() []string {
	result := make([]string, len(sensitiveWords))
	copy(result, sensitiveWords)
	return result
}
