package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// ChatMessage represents a single message in the conversation.
type ChatMessage struct {
	Role    string `json:"role"`    // "user", "assistant", "system"
	Content string `json:"content"` // message content
}

// ChatRequest is the request body for the chat endpoint.
type ChatRequest struct {
	Messages []ChatMessage `json:"messages"` // conversation history (user msgs already include latest)
	Model   string        `json:"model"`    // e.g. "gpt-4o", "claude-3-5-sonnet-latest"
	APIKey  string        `json:"api_key"`  // user's API key
	UserID  string        `json:"user_id,omitempty"`
}

// HandleChat handles POST /api/chat
// Streams back the LLM response using SSE (text/event-stream).
// Falls back to non-streaming if streaming fails.
func HandleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "Invalid request body", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	if len(req.Messages) == 0 || req.APIKey == "" || req.Model == "" {
		writeError(w, "messages, model, and api_key are required", "BAD_REQUEST", http.StatusBadRequest)
		return
	}

	// Fast-fail on obviously fake/invalid keys
	if strings.HasPrefix(req.APIKey, "sk-fake") || req.APIKey == "sk-test" || req.APIKey == "test" {
		writeError(w, "请在「模型设置」中配置真实的 API Key（以 sk- 开头）", "INVALID_API_KEY", http.StatusBadRequest)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		// Fallback to non-streaming
		HandleChatNonStreaming(w, r, &req)
		return
	}

	// Try streaming first, fall back to non-streaming only on error
	if err := handleChatStreaming(w, flusher, &req); err != nil {
		// Only fallback for specific known-recoverable errors
		// Don't fallback on timeout/network errors - just fail fast
		errStr := err.Error()
		if strings.HasPrefix(errStr, "Anthropic") || strings.HasPrefix(errStr, "Gemini") {
			log.Printf("[Chat] Streaming failed, falling back to non-streaming: %v", err)
			HandleChatNonStreaming(w, r, &req)
			return
		}
		// For OpenAI/timeouts - return error directly as SSE
		log.Printf("[Chat] Streaming failed: %v", err)
		fmt.Fprintf(w, "data: [ERROR] %s\n\n", err.Error())
		flusher.Flush()
	}
}

// handleChatStreaming calls the LLM in streaming mode and writes SSE to the response.
func handleChatStreaming(w http.ResponseWriter, flusher http.Flusher, req *ChatRequest) error {
	var body interface{}
	var url string
	var headers map[string]string

	model := strings.ToLower(req.Model)

	switch {
	case strings.HasPrefix(model, "gpt-") || strings.HasPrefix(model, "o1") || strings.HasPrefix(model, "o3"):
		// OpenAI compatible
		url = "https://api.openai.com/v1/chat/completions"
		headers = map[string]string{
			"Content-Type":  "application/json",
			"Authorization": "Bearer " + req.APIKey,
		}
		body = buildOpenAIReq(req.Messages, req.Model)

	case strings.HasPrefix(model, "claude-"):
		// Anthropic - no streaming for Messages API, use non-streaming fallback
		return fmt.Errorf("Anthropic streaming not supported via this path")

	case strings.HasPrefix(model, "gemini-"):
		// Google Gemini - different API format, use non-streaming
		return fmt.Errorf("Gemini streaming not supported via this path")

	default:
		// Default to OpenAI-compatible
		url = "https://api.openai.com/v1/chat/completions"
		headers = map[string]string{
			"Content-Type":  "application/json",
			"Authorization": "Bearer " + req.APIKey,
		}
		body = buildOpenAIReq(req.Messages, req.Model)
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	for k, v := range headers {
		httpReq.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("LLM request failed: %w", err)
	}
	defer resp.Body.Close()

	// Any error status = fail fast (don't fallback), return error to client
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("LLM_API_ERROR:%d:%s", resp.StatusCode, string(bodyBytes))
	}

	// Read SSE stream and forward to client
	reader := resp.Body
	buf := make([]byte, 0, 4096)
	for {
		chunk := make([]byte, 1024)
		n, err := reader.Read(chunk)
		if n > 0 {
			buf = append(buf, chunk[:n]...)
			// Process complete SSE lines
			for {
				line := findSSELine(buf)
				if line == nil {
					break
				}
				// Parse OpenAI SSE: "data: {...}"
				if len(line) > 6 && string(line[:6]) == "data: " {
					data := string(line[6:])
					if data == "[DONE]" {
						flusher.Flush()
						return nil
					}
					// Parse the chunk and extract content
					var chunkData struct {
						Choices []struct {
							Delta struct {
								Content string `json:"content"`
							} `json:"delta"`
						} `json:"choices"`
					}
					if json.Unmarshal([]byte(data), &chunkData) == nil && len(chunkData.Choices) > 0 {
						content := chunkData.Choices[0].Delta.Content
						if content != "" {
							fmt.Fprintf(w, "data: %s\n\n", content)
							flusher.Flush()
						}
					}
				}
			}
		}
		if err != nil {
			break
		}
	}

	fmt.Fprintf(w, "data: [DONE]\n\n")
	flusher.Flush()
	return nil
}

// findSSELine finds and removes one complete SSE line from buf.
// Returns nil if no complete line yet.
func findSSELine(buf []byte) []byte {
	for i := 0; i < len(buf); i++ {
		if buf[i] == '\n' {
			line := buf[:i]
			// Skip \r
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			// Remove processed bytes
			copy(buf, buf[i+1:])
			return line
		}
	}
	return nil
}

// HandleChatNonStreaming handles chat without streaming (fallback for providers without streaming).
func HandleChatNonStreaming(w http.ResponseWriter, r *http.Request, req *ChatRequest) {
	model := strings.ToLower(req.Model)

	var llmResp []byte
	var err error

	switch {
	case strings.HasPrefix(model, "gpt-") || strings.HasPrefix(model, "o1") || strings.HasPrefix(model, "o3"):
		llmResp, err = callOpenAI(req.Messages, req.Model, req.APIKey)

	case strings.HasPrefix(model, "claude-"):
		llmResp, err = callAnthropic(req.Messages, req.Model, req.APIKey)

	case strings.HasPrefix(model, "gemini-"):
		llmResp, err = callGemini(req.Messages, req.Model, req.APIKey)

	default:
		// Default to OpenAI-compatible
		llmResp, err = callOpenAI(req.Messages, req.Model, req.APIKey)
	}

	if err != nil {
		writeError(w, fmt.Sprintf("LLM call failed: %v", err), "LLM_ERROR", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(llmResp)
}

// buildOpenAIReq builds the OpenAI-compatible request body.
func buildOpenAIReq(messages []ChatMessage, model string) map[string]interface{} {
	systemPrompt := `你是一个资深的 AI 产品经理助手。你的职责是在用户描述他们想要的应用或功能时，通过多轮对话主动提问、澄清需求，确保在开始编码之前对需求有全面、清晰的理解。

在对话中，你要：
1. 先理解用户想做什么
2. 针对不清晰的地方主动追问（功能细节、技术偏好、用户群体、边界情况等）
3. 引导用户完善需求，直到你感觉已经足够清晰
4. 当你确认需求已经完整时，输出「需求已确认」，并给出简洁的需求摘要

保持对话友好、专业，不要一次性问太多问题，每次问 1-3 个最关键的问题。`

	// Build messages with system prompt prepended
	openAIMsgs := make([]map[string]string, 0, len(messages)+1)
	openAIMsgs = append(openAIMsgs, map[string]string{
		"role":    "system",
		"content": systemPrompt,
	})
	for _, m := range messages {
		role := m.Role
		if role == "system" {
			role = "assistant"
		}
		openAIMsgs = append(openAIMsgs, map[string]string{
			"role":    role,
			"content": m.Content,
		})
	}

	return map[string]interface{}{
		"model":    model,
		"messages": openAIMsgs,
		"stream":   true,
	}
}

// callOpenAI calls the OpenAI chat completions API (non-streaming).
func callOpenAI(messages []ChatMessage, model, apiKey string) ([]byte, error) {
	openAIReq := buildOpenAIReq(messages, model)
	delete(openAIReq, "stream") // non-streaming

	jsonBody, _ := json.Marshal(openAIReq)
	req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// Parse and extract content
	var respData struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(bodyBytes, &respData); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	if len(respData.Choices) == 0 {
		return nil, fmt.Errorf("no response from OpenAI")
	}

	// Return as our standard format
	return json.Marshal(map[string]interface{}{
		"content": respData.Choices[0].Message.Content,
	})
}

// callAnthropic calls the Anthropic Messages API.
func callAnthropic(messages []ChatMessage, model, apiKey string) ([]byte, error) {
	// Build Anthropic request body
	var anthropicMsgs []map[string]string
	systemPrompt := `你是一个资深的 AI 产品经理助手。你的职责是在用户描述他们想要的应用或功能时，通过多轮对话主动提问、澄清需求，确保在开始编码之前对需求有全面、清晰的理解。`

	for _, m := range messages {
		if m.Role == "user" {
			anthropicMsgs = append(anthropicMsgs, map[string]string{
				"role":      "user",
				"content": m.Content,
			})
		} else {
			anthropicMsgs = append(anthropicMsgs, map[string]string{
				"role":      "assistant",
				"content": m.Content,
			})
		}
	}

	reqBody := map[string]interface{}{
		"model": model,
		"messages": anthropicMsgs,
		"max_tokens": 4096,
		"system": systemPrompt,
	}

	jsonBody, _ := json.Marshal(reqBody)
	req, err := http.NewRequest(http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Anthropic API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var respData struct {
		Content []struct {
			Type     string `json:"type"`
			Text     string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(bodyBytes, &respData); err != nil {
		return nil, fmt.Errorf("failed to parse Anthropic response: %w", err)
	}

	var content string
	for _, block := range respData.Content {
		if block.Type == "text" {
			content += block.Text
		}
	}

	return json.Marshal(map[string]interface{}{
		"content": content,
	})
}

// callGemini calls the Google Gemini API.
func callGemini(messages []ChatMessage, model, apiKey string) ([]byte, error) {
	// Build contents array
	var contents []map[string]interface{}
	for _, m := range messages {
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		contents = append(contents, map[string]interface{}{
			"role": role,
			"parts": []map[string]string{
				{"text": m.Content},
			},
		})
	}

	systemInstruction := `你是一个资深的 AI 产品经理助手。你的职责是在用户描述他们想要的应用或功能时，通过多轮对话主动提问、澄清需求，确保在开始编码之前对需求有全面、清晰的理解。`

	reqBody := map[string]interface{}{
		"contents": contents,
		"systemInstruction": map[string]interface{}{"parts": []map[string]string{
			{"text": systemInstruction},
		}},
	}

	// Extract just the model name without "models/" prefix
	actualModel := strings.TrimPrefix(model, "models/")
	if !strings.Contains(actualModel, "/") {
		actualModel = actualModel + "-001"
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		strings.Split(actualModel, "-")[0]+":001", apiKey)

	jsonBody, _ := json.Marshal(reqBody)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gemini API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var respData struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(bodyBytes, &respData); err != nil {
		return nil, fmt.Errorf("failed to parse Gemini response: %w", err)
	}

	var content string
	if len(respData.Candidates) > 0 {
		for _, part := range respData.Candidates[0].Content.Parts {
			content += part.Text
		}
	}

	return json.Marshal(map[string]interface{}{
		"content": content,
	})
}
