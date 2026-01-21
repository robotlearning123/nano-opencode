// nano-opencode: Minimal AI coding agent in Go (~110 LOC)
// Usage: ANTHROPIC_API_KEY=sk-... go run nano.go "your prompt"
// Build: go build -o nano nano.go

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
)

var tools = json.RawMessage(`[
  {"name":"read_file","description":"Read file","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}},
  {"name":"write_file","description":"Write file","input_schema":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}},
  {"name":"edit_file","description":"Edit file","input_schema":{"type":"object","properties":{"path":{"type":"string"},"old_string":{"type":"string"},"new_string":{"type":"string"}},"required":["path","old_string","new_string"]}},
  {"name":"bash","description":"Run command","input_schema":{"type":"object","properties":{"command":{"type":"string"}},"required":["command"]}},
  {"name":"list_dir","description":"List directory","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}
]`)

type Message struct{ Role string `json:"role"`; Content any `json:"content"` }
type Block struct{ Type string `json:"type"`; ID string `json:"id,omitempty"`; Name string `json:"name,omitempty"`; Input map[string]string `json:"input,omitempty"`; Text string `json:"text,omitempty"` }
type Response struct{ Content []Block `json:"content"`; StopReason string `json:"stop_reason"` }

func run(name string, input map[string]string) string {
	switch name {
	case "read_file":
		data, err := os.ReadFile(input["path"]); if err != nil { return "Error: " + err.Error() }; return string(data)
	case "write_file":
		if err := os.WriteFile(input["path"], []byte(input["content"]), 0644); err != nil { return "Error: " + err.Error() }; return "OK"
	case "edit_file":
		data, err := os.ReadFile(input["path"]); if err != nil { return "Error: " + err.Error() }
		if !strings.Contains(string(data), input["old_string"]) { return "old_string not found" }
		return func() string { os.WriteFile(input["path"], []byte(strings.Replace(string(data), input["old_string"], input["new_string"], 1)), 0644); return "OK" }()
	case "bash":
		out, _ := exec.Command("sh", "-c", input["command"]).Output(); if len(out) > 50000 { out = out[:50000] }; return string(out)
	case "list_dir":
		entries, err := os.ReadDir(func() string { if p := input["path"]; p != "" { return p }; return "." }()); if err != nil { return "Error: " + err.Error() }
		var lines []string; for _, e := range entries { t := "-"; if e.IsDir() { t = "d" }; lines = append(lines, t+" "+e.Name()) }; return strings.Join(lines, "\n")
	}
	return "Unknown tool"
}

func call(url, key string, messages []Message, model string) (*Response, error) {
	body, _ := json.Marshal(map[string]any{"model": model, "max_tokens": 8192, "tools": tools, "messages": messages, "system": "You are a coding assistant. Use tools to help."})
	req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json"); req.Header.Set("x-api-key", key); req.Header.Set("anthropic-version", "2023-06-01")
	resp, err := http.DefaultClient.Do(req); if err != nil { return nil, err }; defer resp.Body.Close()
	if resp.StatusCode != 200 { b, _ := io.ReadAll(resp.Body); return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, b) }
	var res Response; json.NewDecoder(resp.Body).Decode(&res); return &res, nil
}

func agent(prompt, url, key, model string) (string, error) {
	messages := []Message{{Role: "user", Content: prompt}}
	for {
		res, err := call(url, key, messages, model); if err != nil { return "", err }
		messages = append(messages, Message{Role: "assistant", Content: res.Content})
		if res.StopReason != "tool_use" {
			var texts []string; for _, b := range res.Content { if b.Type == "text" { texts = append(texts, b.Text) } }; return strings.Join(texts, ""), nil
		}
		var results []map[string]any
		for _, b := range res.Content {
			if b.Type == "tool_use" { fmt.Println("⚡", b.Name); r := run(b.Name, b.Input); fmt.Println(r[:min(len(r), 100)]); results = append(results, map[string]any{"type": "tool_result", "tool_use_id": b.ID, "content": r}) }
		}
		messages = append(messages, Message{Role: "user", Content: results})
	}
}

func env(key, def string) string { if v := os.Getenv(key); v != "" { return v }; return def }

func main() {
	if len(os.Args) < 2 { fmt.Fprintln(os.Stderr, "Usage: nano \"your prompt\""); os.Exit(1) }
	key := env("ANTHROPIC_API_KEY", env("ANTHROPIC_AUTH_TOKEN", "")); if key == "" { fmt.Fprintln(os.Stderr, "Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN"); os.Exit(1) }
	base := strings.TrimSuffix(env("ANTHROPIC_BASE_URL", "https://api.anthropic.com"), "/")
	result, err := agent(strings.Join(os.Args[1:], " "), base+"/v1/messages", key, env("MODEL", "claude-sonnet-4-20250514"))
	if err != nil { fmt.Fprintln(os.Stderr, "Error:", err); os.Exit(1) }
	fmt.Println(result)
}

func min(a, b int) int { if a < b { return a }; return b }
