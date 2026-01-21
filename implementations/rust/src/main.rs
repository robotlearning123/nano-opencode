// nano-opencode: Minimal AI coding agent in Rust (~120 LOC)
// Usage: ANTHROPIC_API_KEY=sk-... cargo run "your prompt"
// Build: cargo build --release

use std::{env, fs, process::Command, io::Write};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const TOOLS: &str = r#"[
  {"name":"read_file","description":"Read file","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}},
  {"name":"write_file","description":"Write file","input_schema":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}},
  {"name":"edit_file","description":"Edit file","input_schema":{"type":"object","properties":{"path":{"type":"string"},"old_string":{"type":"string"},"new_string":{"type":"string"}},"required":["path","old_string","new_string"]}},
  {"name":"bash","description":"Run command","input_schema":{"type":"object","properties":{"command":{"type":"string"}},"required":["command"]}},
  {"name":"list_dir","description":"List directory","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}
]"#;

#[derive(Serialize)]
struct Request { model: String, max_tokens: u32, tools: Value, messages: Vec<Message>, system: String }

#[derive(Serialize, Deserialize, Clone)]
struct Message { role: String, content: Value }

#[derive(Deserialize)]
struct Response { content: Vec<Block>, stop_reason: String }

#[derive(Deserialize, Clone)]
struct Block { r#type: String, id: Option<String>, name: Option<String>, input: Option<Value>, text: Option<String> }

fn run(name: &str, input: &Value) -> String {
    match name {
        "read_file" => fs::read_to_string(input["path"].as_str().unwrap_or(".")).unwrap_or_else(|e| format!("Error: {}", e)),
        "write_file" => {
            fs::write(input["path"].as_str().unwrap_or(""), input["content"].as_str().unwrap_or(""))
                .map(|_| "OK".to_string()).unwrap_or_else(|e| format!("Error: {}", e))
        }
        "edit_file" => {
            let path = input["path"].as_str().unwrap_or("");
            match fs::read_to_string(path) {
                Ok(content) => {
                    let old = input["old_string"].as_str().unwrap_or("");
                    let new = input["new_string"].as_str().unwrap_or("");
                    if content.contains(old) {
                        fs::write(path, content.replacen(old, new, 1)).map(|_| "OK".to_string()).unwrap_or_else(|e| format!("Error: {}", e))
                    } else { "old_string not found".to_string() }
                }
                Err(e) => format!("Error: {}", e)
            }
        }
        "bash" => {
            Command::new("sh").arg("-c").arg(input["command"].as_str().unwrap_or(""))
                .output().map(|o| String::from_utf8_lossy(&o.stdout).chars().take(50000).collect())
                .unwrap_or_else(|e| format!("Error: {}", e))
        }
        "list_dir" => {
            fs::read_dir(input["path"].as_str().unwrap_or("."))
                .map(|entries| entries.filter_map(|e| e.ok())
                    .map(|e| format!("{} {}", if e.file_type().map(|t| t.is_dir()).unwrap_or(false) { "d" } else { "-" }, e.file_name().to_string_lossy()))
                    .collect::<Vec<_>>().join("\n"))
                .unwrap_or_else(|e| format!("Error: {}", e))
        }
        _ => "Unknown tool".to_string()
    }
}

fn call(client: &ureq::Agent, url: &str, key: &str, messages: &[Message], model: &str) -> Result<Response, String> {
    let tools: Value = serde_json::from_str(TOOLS).unwrap();
    let req = Request { model: model.to_string(), max_tokens: 8192, tools, messages: messages.to_vec(), system: "You are a coding assistant. Use tools to help.".to_string() };

    client.post(url)
        .set("Content-Type", "application/json")
        .set("x-api-key", key)
        .set("anthropic-version", "2023-06-01")
        .send_json(&req)
        .map_err(|e| format!("API error: {}", e))?
        .into_json::<Response>()
        .map_err(|e| format!("Parse error: {}", e))
}

fn agent(prompt: &str, url: &str, key: &str, model: &str) -> Result<String, String> {
    let client = ureq::agent();
    let mut messages = vec![Message { role: "user".to_string(), content: json!(prompt) }];

    loop {
        let res = call(&client, url, key, &messages, model)?;
        messages.push(Message { role: "assistant".to_string(), content: json!(res.content) });

        if res.stop_reason != "tool_use" {
            return Ok(res.content.iter().filter(|b| b.r#type == "text").filter_map(|b| b.text.clone()).collect::<Vec<_>>().join(""));
        }

        let results: Vec<Value> = res.content.iter().filter(|b| b.r#type == "tool_use").map(|b| {
            let name = b.name.as_ref().unwrap();
            println!("⚡ {}", name);
            let r = run(name, b.input.as_ref().unwrap());
            println!("{}", &r[..r.len().min(100)]);
            json!({"type": "tool_result", "tool_use_id": b.id, "content": r})
        }).collect();

        messages.push(Message { role: "user".to_string(), content: json!(results) });
    }
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() { eprintln!("Usage: nano \"your prompt\""); std::process::exit(1); }

    let key = env::var("ANTHROPIC_API_KEY").or_else(|_| env::var("ANTHROPIC_AUTH_TOKEN")).unwrap_or_default();
    if key.is_empty() { eprintln!("Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN"); std::process::exit(1); }

    let base = env::var("ANTHROPIC_BASE_URL").unwrap_or_else(|_| "https://api.anthropic.com".to_string());
    let url = format!("{}/v1/messages", base.trim_end_matches('/'));
    let model = env::var("MODEL").unwrap_or_else(|_| "claude-sonnet-4-20250514".to_string());

    match agent(&args.join(" "), &url, &key, &model) {
        Ok(result) => println!("{}", result),
        Err(e) => eprintln!("Error: {}", e),
    }
}
