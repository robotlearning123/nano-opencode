#!/usr/bin/env python3
"""
nano-opencode: Minimal AI coding agent in Python (~100 LOC)
Works on any device with Python 3.8+ (Raspberry Pi, embedded, etc.)

Usage: ANTHROPIC_API_KEY=sk-... python nano.py "read package.json"
"""

import os, sys, json, subprocess
from pathlib import Path
from urllib.request import Request, urlopen

API_KEY = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN", "")
MODEL = os.environ.get("MODEL", "claude-sonnet-4-20250514")
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
API_URL = f"{BASE_URL.rstrip('/')}/v1/messages"

TOOLS = [
    {"name": "read_file", "description": "Read file", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "write_file", "description": "Write file", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "edit_file", "description": "Edit file", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_string": {"type": "string"}, "new_string": {"type": "string"}}, "required": ["path", "old_string", "new_string"]}},
    {"name": "bash", "description": "Run command", "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "list_dir", "description": "List directory", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
]

def run(name: str, i: dict) -> str:
    try:
        if name == "read_file":
            return Path(i["path"]).read_text() if Path(i["path"]).exists() else "File not found"
        if name == "write_file":
            Path(i["path"]).write_text(i["content"]); return "OK"
        if name == "edit_file":
            p = Path(i["path"]); c = p.read_text()
            if i["old_string"] not in c: return "old_string not found"
            p.write_text(c.replace(i["old_string"], i["new_string"], 1)); return "OK"
        if name == "bash":
            return subprocess.run(i["command"], shell=True, capture_output=True, text=True, timeout=30).stdout[:50000]
        if name == "list_dir":
            p = Path(i.get("path", "."))
            return "\n".join(f"{'d' if x.is_dir() else '-'} {x.name}" for x in p.iterdir())
        return "Unknown tool"
    except Exception as e:
        return f"Error: {e}"

def call(messages: list) -> dict:
    data = json.dumps({"model": MODEL, "max_tokens": 8192, "tools": TOOLS, "messages": messages, "system": "You are a coding assistant. Use tools to help."}).encode()
    req = Request(API_URL, data=data, headers={"Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01"})
    with urlopen(req) as res:
        return json.loads(res.read())

def agent(prompt: str) -> str:
    messages = [{"role": "user", "content": prompt}]
    while True:
        res = call(messages)
        messages.append({"role": "assistant", "content": res["content"]})
        if res["stop_reason"] != "tool_use":
            return "".join(b.get("text", "") for b in res["content"] if b["type"] == "text")
        results = []
        for b in res["content"]:
            if b["type"] == "tool_use":
                print(f"⚡ {b['name']}")
                r = run(b["name"], b["input"])
                print(r[:100] + ("..." if len(r) > 100 else ""))
                results.append({"type": "tool_result", "tool_use_id": b["id"], "content": r})
        messages.append({"role": "user", "content": results})

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python nano.py 'your prompt'"); sys.exit(1)
    if not API_KEY:
        print("Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN"); sys.exit(1)
    print(agent(" ".join(sys.argv[1:])))
