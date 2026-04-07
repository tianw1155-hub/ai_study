package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
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
	Model    string        `json:"model"`    // e.g. "gpt-4o", "MiniMax-Text-01", "claude-3-5-sonnet-latest"
	APIKey   string        `json:"api_key"`  // user's API key
	UserID   string        `json:"user_id,omitempty"`
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

// translateMiniMaxModel translates user-friendly MiniMax model names to the actual API model name.
// MiniMax OpenAI-compatible API model names:
// - "MiniMax-M2.7" for M2.7 models
// - "MiniMax-M2.5" for M2.5 models
// - "MiniMax-M2" for M2 models
// - "MiniMax-Text-01" for Text-01 model (200K context)
// - "abab6.5s-chat" / "abab6.5-chat" for ABAB models
func translateMiniMaxModel(model string) (apiModel string, groupID string) {
	lower := strings.ToLower(strings.ReplaceAll(model, " ", "-"))

	switch {
	case strings.Contains(lower, "text-01"):
		// Must check before "m2" since "minimax-text-01" contains substring "m2"
		apiModel = "MiniMax-Text-01"
	case strings.Contains(lower, "m2.7"):
		apiModel = "MiniMax-M2.7"
	case strings.Contains(lower, "m2.5"):
		apiModel = "MiniMax-M2.5"
	case strings.Contains(lower, "m2.1"):
		apiModel = "MiniMax-M2.1"
	case strings.Contains(lower, "minimax-m2"):
		// Check "minimax-m2" before generic "m2" to avoid matching "minimax-text-01"
		if strings.Contains(lower, "minimax-m2.7") {
			apiModel = "MiniMax-M2.7"
		} else if strings.Contains(lower, "minimax-m2.5") {
			apiModel = "MiniMax-M2.5"
		} else if strings.Contains(lower, "minimax-m2.1") {
			apiModel = "MiniMax-M2.1"
		} else {
			apiModel = "MiniMax-M2"
		}
	case strings.Contains(lower, "abab"):
		// ABAB models use their own naming, pass through as-is
		apiModel = model
	default:
		// Unknown MiniMax model, pass through as-is
		apiModel = model
	}
	return apiModel, ""
}

// handleChatStreaming calls the LLM in streaming mode and writes SSE to the response.
func handleChatStreaming(w http.ResponseWriter, flusher http.Flusher, req *ChatRequest) error {
	var body interface{}
	var url string
	var headers map[string]string

	log.Printf("[DEBUG] handleChatStreaming: model=%q api_key_len=%d", req.Model, len(req.APIKey))
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

	case strings.HasPrefix(model, "minimax") || strings.HasPrefix(model, "abab"):
		// MiniMax - OpenAI-compatible endpoint
		url = "https://api.minimaxi.com/v1/chat/completions"
		headers = map[string]string{
			"Content-Type":  "application/json",
			"Authorization": "Bearer " + req.APIKey,
		}
		// Translate user-facing model name to MiniMax API model name
		apiModel, _ := translateMiniMaxModel(req.Model)
		body = buildMiniMaxReq(req.Messages, apiModel)

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

	client := &http.Client{
		Timeout: 120 * time.Second, // 2 min for streaming responses
		Transport: &http.Transport{
			DialContext: (&net.Dialer{Timeout: 30 * time.Second}).DialContext,
		},
	}
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

	// Read SSE stream and forward to client using a ring buffer
	reader := resp.Body
	buf := make([]byte, 8192)
	start := 0
	end := 0

	for {
		if end >= len(buf) {
			n := end - start
			copy(buf, buf[start:end])
			start = 0
			end = n
		}

		nr, err := reader.Read(buf[end:])
		if nr > 0 {
			end += nr
		}
		if err != nil {
			break
		}

		for start < end {
			nlIdx := -1
			for i := start; i < end; i++ {
				if buf[i] == '\n' {
					nlIdx = i
					break
				}
				if buf[i] == '\r' {
					nlIdx = i
					break
				}
			}

			if nlIdx < 0 {
				break
			}

			lineEnd := nlIdx
			if lineEnd > start && buf[lineEnd-1] == '\r' {
				lineEnd--
			}
			line := make([]byte, lineEnd-start)
			copy(line, buf[start:lineEnd])

			if buf[nlIdx] == '\r' && nlIdx+1 < end && buf[nlIdx+1] == '\n' {
				start = nlIdx + 2
			} else {
				start = nlIdx + 1
			}

			if len(line) > 6 && string(line[:6]) == "data: " {
				data := string(line[6:])
				if data == "[DONE]" {
					flusher.Flush()
					return nil
				}
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
						// Use JSON format to properly handle newlines/special chars in SSE
						jsonData, _ := json.Marshal(map[string]string{"content": content})
						fmt.Fprintf(w, "data: %s\n\n", jsonData)
						flusher.Flush()
					}
				}
			}
		}
	}

	fmt.Fprintf(w, "data: [DONE]\n\n")
	flusher.Flush()
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

	case strings.HasPrefix(model, "minimax") || strings.HasPrefix(model, "abab"):
		apiModel, _ := translateMiniMaxModel(req.Model)
		llmResp, err = callMiniMax(req.Messages, apiModel, req.APIKey)

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

// buildMiniMaxReq builds the MiniMax-specific request body.
// MiniMax API requires group_id and uses model name translation.
func buildMiniMaxReq(messages []ChatMessage, model string) map[string]interface{} {
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

	req := map[string]interface{}{
		"model":    model,
		"messages": openAIMsgs,
		"stream":   true,
	}
	return req
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

// callMiniMax calls the MiniMax Chat Completions API (non-streaming).
func callMiniMax(messages []ChatMessage, model, apiKey string) ([]byte, error) {
	reqBody := buildMiniMaxReq(messages, model)
	delete(reqBody, "stream") // non-streaming

	jsonBody, _ := json.Marshal(reqBody)
	req, err := http.NewRequest(http.MethodPost, "https://api.minimaxi.com/v1/chat/completions", bytes.NewReader(jsonBody))
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
		return nil, fmt.Errorf("MiniMax API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var respData struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(bodyBytes, &respData); err != nil {
		return nil, fmt.Errorf("failed to parse MiniMax response: %w", err)
	}

	if len(respData.Choices) == 0 {
		return nil, fmt.Errorf("no response from MiniMax")
	}

	return json.Marshal(map[string]interface{}{
		"content": respData.Choices[0].Message.Content,
	})
}
