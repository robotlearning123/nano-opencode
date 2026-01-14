#!/usr/bin/env python3
"""nano-opencode: 400 lines to beat them all."""

import json, subprocess, sys, signal, time
from pathlib import Path

try:
    import litellm
except ImportError:
    print("Run: pip install litellm")
    sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════════════════════════

MODEL = "anthropic/claude-sonnet-4-20250514"
TOKEN_LIMIT = 100_000
TOOL_LIMIT = 50
TIMEOUT = 120
TRUNCATE_CHARS = 30_000

# ══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM = """You are Nano, an expert software engineer operating in a terminal.

## Tools
You have 6 tools: shell, patch, read, write, find, grep.

## Workflow
1. EXPLORE - Understand the codebase, find relevant files
2. ANALYZE - Read code to understand patterns and style
3. PLAN - Design minimal, precise changes
4. EXECUTE - Apply changes using patch (edits) or write (new files)
5. VERIFY - Run tests/linters to confirm changes work

## Rules
- State your intent before each tool call
- Keep changes minimal and atomic
- Match existing code style exactly
- Verify changes work before declaring success
- If a patch fails, re-read the file to get exact content

{context}"""

# ══════════════════════════════════════════════════════════════════════════════
# TOOL SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

TOOLS = [
    {"type": "function", "function": {
        "name": "shell",
        "description": "Run shell command. Use for: git, tests, builds, installing packages. Output truncated.",
        "parameters": {"type": "object", "properties": {
            "cmd": {"type": "string", "description": "Command to execute"}
        }, "required": ["cmd"]}
    }},
    {"type": "function", "function": {
        "name": "patch",
        "description": "Replace exact text in file. Search must match exactly once. If fails, use read first.",
        "parameters": {"type": "object", "properties": {
            "file": {"type": "string", "description": "File path"},
            "search": {"type": "string", "description": "Exact text to find (including whitespace)"},
            "replace": {"type": "string", "description": "Text to replace with"}
        }, "required": ["file", "search", "replace"]}
    }},
    {"type": "function", "function": {
        "name": "read",
        "description": "Read file contents with line numbers.",
        "parameters": {"type": "object", "properties": {
            "path": {"type": "string", "description": "File path"},
            "start": {"type": "integer", "description": "Start line (1-indexed)"},
            "end": {"type": "integer", "description": "End line"}
        }, "required": ["path"]}
    }},
    {"type": "function", "function": {
        "name": "write",
        "description": "Create or overwrite a file.",
        "parameters": {"type": "object", "properties": {
            "path": {"type": "string", "description": "File path"},
            "content": {"type": "string", "description": "File content"}
        }, "required": ["path", "content"]}
    }},
    {"type": "function", "function": {
        "name": "find",
        "description": "List files in directory with optional glob pattern.",
        "parameters": {"type": "object", "properties": {
            "path": {"type": "string", "description": "Directory (default: .)"},
            "pattern": {"type": "string", "description": "Glob pattern (e.g., **/*.py)"}
        }, "required": []}
    }},
    {"type": "function", "function": {
        "name": "grep",
        "description": "Search for pattern in files. Returns matching lines.",
        "parameters": {"type": "object", "properties": {
            "pattern": {"type": "string", "description": "Regex pattern"},
            "path": {"type": "string", "description": "Directory to search (default: .)"},
            "include": {"type": "string", "description": "File glob (e.g., *.py)"}
        }, "required": ["pattern"]}
    }}
]

# ══════════════════════════════════════════════════════════════════════════════
# TOOLS IMPLEMENTATION
# ══════════════════════════════════════════════════════════════════════════════

def truncate(text: str, max_chars: int = TRUNCATE_CHARS) -> str:
    """Truncate keeping head (25%) and tail (75%) - errors usually at end."""
    if len(text) <= max_chars:
        return text
    head = max_chars // 4
    tail = max_chars - head
    return f"{text[:head]}\n\n... [{len(text) - max_chars:,} chars truncated] ...\n\n{text[-tail:]}"


class Tools:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def safe(self, path: str) -> Path:
        """Resolve path and prevent traversal outside repo."""
        p = (self.root / path).resolve()
        if not str(p).startswith(str(self.root)):
            raise ValueError(f"Path outside repo: {path}")
        return p

    def shell(self, cmd: str) -> str:
        try:
            r = subprocess.run(["bash", "-c", cmd], cwd=self.root, timeout=TIMEOUT,
                               capture_output=True, text=True)
            out = (r.stdout + r.stderr).strip()
            if not out:
                return "Command completed (no output)" if r.returncode == 0 else f"Failed (exit {r.returncode})"
            return truncate(out)
        except subprocess.TimeoutExpired:
            return f"Timeout after {TIMEOUT}s"
        except Exception as e:
            return f"Error: {e}"

    def patch(self, file: str, search: str, replace: str) -> str:
        try:
            p = self.safe(file)
            if not p.exists():
                return f"File not found: {file}"
            content = p.read_text()
            count = content.count(search)
            if count == 0:
                return "Search not found. Use 'read' to see exact content."
            if count > 1:
                return f"Found {count} matches. Add more context to make unique."
            p.write_text(content.replace(search, replace, 1))
            return "Patch applied"
        except Exception as e:
            return f"Error: {e}"

    def read(self, path: str, start: int = None, end: int = None) -> str:
        try:
            p = self.safe(path)
            if not p.exists():
                return f"File not found: {path}"
            lines = p.read_text().splitlines()
            if start or end:
                start = (start or 1) - 1
                end = end or len(lines)
                lines = lines[start:end]
                start_num = start + 1
            else:
                start_num = 1
            numbered = [f"{i+start_num:4d}| {l}" for i, l in enumerate(lines)]
            return truncate("\n".join(numbered))
        except Exception as e:
            return f"Error: {e}"

    def write(self, path: str, content: str) -> str:
        try:
            p = self.safe(path)
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
            return f"Written: {path} ({len(content)} bytes)"
        except Exception as e:
            return f"Error: {e}"

    def find(self, path: str = ".", pattern: str = None) -> str:
        try:
            p = self.safe(path)
            files = list(p.glob(pattern)) if pattern else list(p.iterdir())
            result = []
            for f in sorted(files)[:100]:
                rel = f.relative_to(self.root)
                prefix = "D " if f.is_dir() else "F "
                result.append(f"{prefix}{rel}")
            if len(files) > 100:
                result.append(f"... and {len(files) - 100} more")
            return "\n".join(result) or "No files found"
        except Exception as e:
            return f"Error: {e}"

    def grep(self, pattern: str, path: str = ".", include: str = None) -> str:
        try:
            p = self.safe(path)
            cmd = ["grep", "-rn", "--include", include, pattern, str(p)] if include else \
                  ["grep", "-rn", pattern, str(p)]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return truncate(r.stdout) if r.stdout else "No matches"
        except Exception as e:
            return f"Error: {e}"

    def execute(self, name: str, args: dict) -> str:
        method = getattr(self, name, None)
        if not method:
            return f"Unknown tool: {name}"
        try:
            return method(**args)
        except Exception as e:
            return f"Tool error: {e}"

# ══════════════════════════════════════════════════════════════════════════════
# AGENT
# ══════════════════════════════════════════════════════════════════════════════

def load_context(root: Path) -> str:
    """Load AGENT.md or similar project context file."""
    for name in ["AGENT.md", ".agent.md", "CLAUDE.md", ".claude.md"]:
        p = root / name
        if p.exists():
            return f"\n## Project Context\n{p.read_text()}"
    return ""


class Agent:
    def __init__(self, root: Path, model: str = MODEL):
        self.root = root
        self.model = model
        self.tools = Tools(root)
        self.messages = []
        self.calls = 0
        self.tokens = 0

    def run(self, task: str) -> str:
        context = load_context(self.root)
        self.messages = [
            {"role": "system", "content": SYSTEM.format(context=context)},
            {"role": "user", "content": task}
        ]
        self.calls = 0

        while self.calls < TOOL_LIMIT:
            try:
                r = litellm.completion(model=self.model, messages=self.messages, 
                                       tools=TOOLS, tool_choice="auto")
            except Exception as e:
                return f"LLM error: {e}"

            msg = r.choices[0].message
            self.tokens += r.usage.total_tokens if r.usage else 0
            
            # Convert to dict for appending
            msg_dict = {"role": "assistant", "content": msg.content or ""}
            if msg.tool_calls:
                msg_dict["tool_calls"] = [
                    {"id": tc.id, "type": "function", 
                     "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in msg.tool_calls
                ]
            self.messages.append(msg_dict)

            # Print thinking
            if msg.content:
                print(f"\n{msg.content}")

            if not msg.tool_calls:
                break

            for tc in msg.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    result = "Invalid JSON arguments"
                else:
                    print(f"\n> {name}({', '.join(f'{k}={repr(v)[:50]}' for k,v in args.items())})")
                    result = self.tools.execute(name, args)
                    # Show truncated result
                    preview = result[:200] + "..." if len(result) > 200 else result
                    print(f"  {preview}")

                self.messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result
                })
                self.calls += 1

                # Budget warning
                if self.calls >= TOOL_LIMIT - 5:
                    self.messages[-1]["content"] += f"\n\n⚠️ {TOOL_LIMIT - self.calls} tool calls remaining."

        return self.messages[-1].get("content", "")

# ══════════════════════════════════════════════════════════════════════════════
# CLI / REPL
# ══════════════════════════════════════════════════════════════════════════════

def handle_cmd(cmd: str, agent: Agent) -> bool:
    """Handle slash commands. Returns True if should exit."""
    parts = cmd.split(maxsplit=1)
    c = parts[0].lower()
    
    if c in ["/quit", "/exit", "/q"]:
        return True
    elif c == "/help":
        print("""
Commands:
  /help     Show this help
  /cost     Show token usage
  /clear    Clear conversation
  /model X  Switch model
  /quit     Exit
""")
    elif c == "/cost":
        print(f"Tokens: {agent.tokens:,} | Tool calls: {agent.calls}")
    elif c == "/clear":
        agent.messages = []
        agent.calls = 0
        print("Cleared")
    elif c == "/model":
        if len(parts) > 1:
            agent.model = parts[1]
            print(f"Model: {agent.model}")
        else:
            print(f"Current: {agent.model}")
    else:
        print(f"Unknown: {c}. Type /help")
    return False


def repl(agent: Agent):
    """Interactive REPL."""
    print(f"nano-opencode | {agent.model} | /help for commands\n")
    
    interrupt_count = 0
    def handle_interrupt(sig, frame):
        nonlocal interrupt_count
        interrupt_count += 1
        if interrupt_count > 1:
            print("\nExiting...")
            sys.exit(0)
        print("\n(Ctrl+C again to exit)")
    signal.signal(signal.SIGINT, handle_interrupt)

    while True:
        try:
            interrupt_count = 0
            task = input("nano> ").strip()
            if not task:
                continue
            if task.startswith("/"):
                if handle_cmd(task, agent):
                    break
            else:
                agent.run(task)
                print()
        except EOFError:
            break
        except KeyboardInterrupt:
            continue


def main():
    import argparse
    p = argparse.ArgumentParser(description="nano-opencode: 400 lines to beat them all")
    p.add_argument("task", nargs="*", help="Task to perform (omit for REPL)")
    p.add_argument("-m", "--model", default=MODEL, help="Model to use")
    args = p.parse_args()

    agent = Agent(Path.cwd(), args.model)
    
    if args.task:
        agent.run(" ".join(args.task))
    else:
        repl(agent)


if __name__ == "__main__":
    main()
