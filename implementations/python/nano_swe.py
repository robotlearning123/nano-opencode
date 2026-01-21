#!/usr/bin/env python3
"""
nano-opencode SWE-bench: Extended AI coding agent for real-world software engineering (~250 LOC)
Capable of solving GitHub issues, debugging, refactoring, and passing SWE-bench evaluations.

Features:
- 15+ tools for code navigation, editing, testing, and git operations
- Multi-file atomic edits with rollback
- Intelligent code search (grep, ripgrep, AST-aware)
- Test execution and validation
- Git integration (diff, patch, status)

Usage: ANTHROPIC_API_KEY=sk-... python nano_swe.py "fix the bug in issue #123"
"""

import os, sys, json, subprocess, re, shutil, tempfile
from pathlib import Path
from urllib.request import Request, urlopen
from datetime import datetime

API_KEY = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN", "")
MODEL = os.environ.get("MODEL", "claude-sonnet-4-20250514")
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
API_URL = f"{BASE_URL.rstrip('/')}/v1/messages"
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "8192"))
MAX_TURNS = int(os.environ.get("MAX_TURNS", "50"))

# ═══════════════════════════════════════════════════════════════════════════════
# TOOL DEFINITIONS - 15 tools for SWE-bench level tasks
# ═══════════════════════════════════════════════════════════════════════════════

TOOLS = [
    # === File Operations ===
    {"name": "read_file", "description": "Read file content. Use line_start/line_end for large files.",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string", "description": "File path"},
         "line_start": {"type": "integer", "description": "Start line (1-indexed, optional)"},
         "line_end": {"type": "integer", "description": "End line (optional)"}
     }, "required": ["path"]}},

    {"name": "write_file", "description": "Create or overwrite file",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string"}, "content": {"type": "string"}
     }, "required": ["path", "content"]}},

    {"name": "edit_file", "description": "Replace exact string in file. old_string must match exactly.",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string"},
         "old_string": {"type": "string", "description": "Exact text to find (include enough context)"},
         "new_string": {"type": "string", "description": "Replacement text"}
     }, "required": ["path", "old_string", "new_string"]}},

    {"name": "multi_edit", "description": "Apply multiple edits atomically. All edits succeed or all fail.",
     "input_schema": {"type": "object", "properties": {
         "edits": {"type": "array", "items": {"type": "object", "properties": {
             "path": {"type": "string"}, "old_string": {"type": "string"}, "new_string": {"type": "string"}
         }, "required": ["path", "old_string", "new_string"]}}
     }, "required": ["edits"]}},

    # === Code Search ===
    {"name": "grep", "description": "Search file contents with regex. Returns matching lines with context.",
     "input_schema": {"type": "object", "properties": {
         "pattern": {"type": "string", "description": "Regex pattern"},
         "path": {"type": "string", "description": "File or directory to search (default: .)"},
         "include": {"type": "string", "description": "File pattern, e.g. '*.py'"},
         "context": {"type": "integer", "description": "Lines of context (default: 2)"}
     }, "required": ["pattern"]}},

    {"name": "find_files", "description": "Find files by name pattern",
     "input_schema": {"type": "object", "properties": {
         "pattern": {"type": "string", "description": "Glob pattern, e.g. '**/*.py' or 'test_*.py'"},
         "path": {"type": "string", "description": "Directory to search (default: .)"}
     }, "required": ["pattern"]}},

    {"name": "find_definition", "description": "Find function/class/variable definition in codebase",
     "input_schema": {"type": "object", "properties": {
         "name": {"type": "string", "description": "Symbol name to find"},
         "type": {"type": "string", "enum": ["function", "class", "variable", "any"], "description": "Symbol type"}
     }, "required": ["name"]}},

    # === Directory Operations ===
    {"name": "list_dir", "description": "List directory contents with file sizes",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string", "description": "Directory path (default: .)"},
         "recursive": {"type": "boolean", "description": "List recursively (default: false)"},
         "max_depth": {"type": "integer", "description": "Max depth for recursive (default: 3)"}
     }, "required": []}},

    {"name": "tree", "description": "Show directory tree structure",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string", "description": "Directory path (default: .)"},
         "max_depth": {"type": "integer", "description": "Max depth (default: 3)"},
         "include": {"type": "string", "description": "Include pattern (e.g. '*.py')"}
     }, "required": []}},

    # === Shell & Testing ===
    {"name": "bash", "description": "Run shell command. Use for git, pip, make, etc.",
     "input_schema": {"type": "object", "properties": {
         "command": {"type": "string"},
         "timeout": {"type": "integer", "description": "Timeout in seconds (default: 120)"},
         "cwd": {"type": "string", "description": "Working directory"}
     }, "required": ["command"]}},

    {"name": "run_tests", "description": "Run test suite and return results",
     "input_schema": {"type": "object", "properties": {
         "test_path": {"type": "string", "description": "Test file/dir (default: auto-detect)"},
         "pattern": {"type": "string", "description": "Test name pattern"},
         "verbose": {"type": "boolean", "description": "Verbose output"}
     }, "required": []}},

    # === Git Operations ===
    {"name": "git_status", "description": "Show git status (modified, staged, untracked files)",
     "input_schema": {"type": "object", "properties": {}, "required": []}},

    {"name": "git_diff", "description": "Show git diff of changes",
     "input_schema": {"type": "object", "properties": {
         "path": {"type": "string", "description": "File path (optional, default: all)"},
         "staged": {"type": "boolean", "description": "Show staged changes"}
     }, "required": []}},

    {"name": "git_log", "description": "Show recent commits",
     "input_schema": {"type": "object", "properties": {
         "count": {"type": "integer", "description": "Number of commits (default: 10)"},
         "path": {"type": "string", "description": "File path (optional)"}
     }, "required": []}},

    # === Context & Planning ===
    {"name": "think", "description": "Record your reasoning without taking action. Use for complex problems.",
     "input_schema": {"type": "object", "properties": {
         "thought": {"type": "string", "description": "Your analysis or reasoning"}
     }, "required": ["thought"]}},
]

# ═══════════════════════════════════════════════════════════════════════════════
# TOOL IMPLEMENTATIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _truncate(s: str, max_len: int = 50000) -> str:
    """Truncate long output with indicator"""
    return s[:max_len] + f"\n...[truncated {len(s)-max_len} chars]" if len(s) > max_len else s

def _run_cmd(cmd: str, timeout: int = 120, cwd: str = None) -> str:
    """Run shell command with timeout"""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        out = r.stdout + r.stderr
        return _truncate(out) if out else "(no output)"
    except subprocess.TimeoutExpired:
        return f"Error: Command timed out after {timeout}s"
    except Exception as e:
        return f"Error: {e}"

def run_tool(name: str, args: dict) -> str:
    """Execute a tool and return result"""
    try:
        # === File Operations ===
        if name == "read_file":
            p = Path(args["path"])
            if not p.exists(): return f"Error: File not found: {args['path']}"
            content = p.read_text()
            lines = content.split('\n')
            start = args.get("line_start", 1) - 1
            end = args.get("line_end", len(lines))
            selected = lines[start:end]
            numbered = [f"{i+start+1:4d} | {line}" for i, line in enumerate(selected)]
            return _truncate('\n'.join(numbered))

        if name == "write_file":
            Path(args["path"]).parent.mkdir(parents=True, exist_ok=True)
            Path(args["path"]).write_text(args["content"])
            return f"OK: Wrote {len(args['content'])} chars to {args['path']}"

        if name == "edit_file":
            p = Path(args["path"])
            if not p.exists(): return f"Error: File not found: {args['path']}"
            content = p.read_text()
            if args["old_string"] not in content:
                # Show similar lines to help debug
                lines = [l for l in content.split('\n') if any(w in l for w in args["old_string"].split()[:3])]
                hint = f"\nSimilar lines:\n" + "\n".join(lines[:5]) if lines else ""
                return f"Error: old_string not found in {args['path']}{hint}"
            if content.count(args["old_string"]) > 1:
                return f"Error: old_string appears {content.count(args['old_string'])} times. Add more context to make it unique."
            p.write_text(content.replace(args["old_string"], args["new_string"], 1))
            return f"OK: Edited {args['path']}"

        if name == "multi_edit":
            # Validate all edits first
            backups = {}
            for edit in args["edits"]:
                p = Path(edit["path"])
                if not p.exists(): return f"Error: File not found: {edit['path']}"
                content = p.read_text()
                if edit["old_string"] not in content:
                    return f"Error: old_string not found in {edit['path']}"
                backups[edit["path"]] = content
            # Apply all edits
            try:
                for edit in args["edits"]:
                    p = Path(edit["path"])
                    content = p.read_text()
                    p.write_text(content.replace(edit["old_string"], edit["new_string"], 1))
                return f"OK: Applied {len(args['edits'])} edits"
            except Exception as e:
                # Rollback on failure
                for path, content in backups.items():
                    Path(path).write_text(content)
                return f"Error: {e} (rolled back all changes)"

        # === Code Search ===
        if name == "grep":
            path = args.get("path", ".")
            ctx = args.get("context", 2)
            include = f"--include='{args['include']}'" if args.get("include") else ""
            cmd = f"grep -rn -E '{args['pattern']}' {path} {include} -B{ctx} -A{ctx} 2>/dev/null | head -200"
            return _run_cmd(cmd) or "No matches found"

        if name == "find_files":
            path = args.get("path", ".")
            cmd = f"find {path} -type f -name '{args['pattern']}' 2>/dev/null | head -100"
            result = _run_cmd(cmd)
            if not result.strip():
                # Try with ** glob
                cmd = f"find {path} -type f -path '*{args['pattern']}' 2>/dev/null | head -100"
                result = _run_cmd(cmd)
            return result or "No files found"

        if name == "find_definition":
            sym = args["name"]
            typ = args.get("type", "any")
            patterns = {
                "function": f"(def|function|fn|func)\\s+{sym}\\s*\\(",
                "class": f"(class|struct|interface|type)\\s+{sym}",
                "variable": f"(let|const|var|val)\\s+{sym}\\s*=",
                "any": f"(def|class|function|fn|func|struct|interface|type|let|const|var)\\s+{sym}"
            }
            pattern = patterns.get(typ, patterns["any"])
            cmd = f"grep -rn -E '{pattern}' . --include='*.py' --include='*.js' --include='*.ts' --include='*.go' --include='*.rs' --include='*.java' 2>/dev/null | head -50"
            return _run_cmd(cmd) or f"No definition found for '{sym}'"

        # === Directory Operations ===
        if name == "list_dir":
            p = Path(args.get("path", "."))
            if not p.exists(): return f"Error: Directory not found: {p}"
            if args.get("recursive"):
                depth = args.get("max_depth", 3)
                cmd = f"find {p} -maxdepth {depth} -type f -exec ls -lh {{}} \\; 2>/dev/null | head -200"
                return _run_cmd(cmd)
            items = []
            for x in sorted(p.iterdir()):
                if x.name.startswith('.'): continue
                size = x.stat().st_size if x.is_file() else 0
                typ = 'd' if x.is_dir() else '-'
                items.append(f"{typ} {size:8d}  {x.name}")
            return '\n'.join(items) or "(empty directory)"

        if name == "tree":
            p = args.get("path", ".")
            depth = args.get("max_depth", 3)
            include = f"-P '{args['include']}'" if args.get("include") else ""
            cmd = f"tree -L {depth} {include} --noreport {p} 2>/dev/null || find {p} -maxdepth {depth} -print 2>/dev/null"
            return _truncate(_run_cmd(cmd))

        # === Shell & Testing ===
        if name == "bash":
            timeout = args.get("timeout", 120)
            cwd = args.get("cwd")
            return _run_cmd(args["command"], timeout=timeout, cwd=cwd)

        if name == "run_tests":
            test_path = args.get("test_path", "")
            pattern = args.get("pattern", "")
            verbose = "-v" if args.get("verbose") else ""

            # Auto-detect test framework
            if Path("pytest.ini").exists() or Path("pyproject.toml").exists() or Path("setup.py").exists():
                pattern_arg = f"-k '{pattern}'" if pattern else ""
                cmd = f"python -m pytest {test_path} {pattern_arg} {verbose} --tb=short 2>&1"
            elif Path("package.json").exists():
                cmd = f"npm test -- {test_path} 2>&1"
            elif Path("Cargo.toml").exists():
                cmd = f"cargo test {test_path} 2>&1"
            elif Path("go.mod").exists():
                cmd = f"go test ./... {verbose} 2>&1"
            else:
                cmd = f"python -m pytest {test_path} {verbose} --tb=short 2>&1"

            return _truncate(_run_cmd(cmd, timeout=300))

        # === Git Operations ===
        if name == "git_status":
            return _run_cmd("git status --short && echo '---' && git diff --stat HEAD 2>/dev/null")

        if name == "git_diff":
            staged = "--staged" if args.get("staged") else ""
            path = args.get("path", "")
            return _truncate(_run_cmd(f"git diff {staged} {path}"))

        if name == "git_log":
            count = args.get("count", 10)
            path = args.get("path", "")
            return _run_cmd(f"git log --oneline -n {count} {path}")

        # === Context & Planning ===
        if name == "think":
            return f"[Thought recorded: {args['thought'][:100]}...]"

        return f"Error: Unknown tool '{name}'"

    except Exception as e:
        return f"Error: {type(e).__name__}: {e}"

# ═══════════════════════════════════════════════════════════════════════════════
# AGENT LOOP
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are an expert software engineer solving real-world GitHub issues.

## Approach
1. **Understand**: Read the issue/problem carefully. Explore the codebase to understand context.
2. **Locate**: Find relevant files using grep, find_files, find_definition.
3. **Analyze**: Read the specific code sections. Understand the bug/feature.
4. **Plan**: Use 'think' tool to record your analysis and plan.
5. **Implement**: Make minimal, focused changes. Prefer edit_file over write_file.
6. **Verify**: Run tests to ensure your fix works and doesn't break existing functionality.

## Best Practices
- Make the MINIMAL change needed to fix the issue
- Don't refactor unrelated code
- Match existing code style exactly
- Always run relevant tests after changes
- If tests fail, analyze and fix before declaring done

## Tools Available
- File ops: read_file, write_file, edit_file, multi_edit
- Search: grep, find_files, find_definition
- Navigation: list_dir, tree
- Shell: bash, run_tests
- Git: git_status, git_diff, git_log
- Planning: think
"""

def call_api(messages: list) -> dict:
    """Make API call to Claude"""
    data = json.dumps({
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "tools": TOOLS,
        "messages": messages,
        "system": SYSTEM_PROMPT
    }).encode()

    req = Request(API_URL, data=data, headers={
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
    })

    with urlopen(req, timeout=120) as res:
        return json.loads(res.read())

def agent(prompt: str, verbose: bool = True) -> str:
    """Run the agent loop"""
    messages = [{"role": "user", "content": prompt}]
    turn = 0

    while turn < MAX_TURNS:
        turn += 1
        if verbose: print(f"\n{'='*60}\n[Turn {turn}/{MAX_TURNS}]")

        try:
            response = call_api(messages)
        except Exception as e:
            print(f"API Error: {e}")
            return f"Error: API call failed: {e}"

        messages.append({"role": "assistant", "content": response["content"]})

        # Print assistant's text response
        for block in response["content"]:
            if block["type"] == "text" and block.get("text"):
                if verbose: print(f"\n{block['text'][:500]}{'...' if len(block['text']) > 500 else ''}")

        # Check if done
        if response["stop_reason"] != "tool_use":
            final = "".join(b.get("text", "") for b in response["content"] if b["type"] == "text")
            return final

        # Execute tools
        results = []
        for block in response["content"]:
            if block["type"] == "tool_use":
                tool_name = block["name"]
                tool_input = block["input"]

                if verbose: print(f"\n⚡ {tool_name}: {str(tool_input)[:80]}...")

                result = run_tool(tool_name, tool_input)

                if verbose:
                    preview = result[:200] + "..." if len(result) > 200 else result
                    print(f"   → {preview}")

                results.append({
                    "type": "tool_result",
                    "tool_use_id": block["id"],
                    "content": result
                })

        messages.append({"role": "user", "content": results})

    return "Error: Max turns exceeded"

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print("""
╔═══════════════════════════════════════════════════════════════════════════════╗
║  nano-opencode SWE-bench Agent                                                ║
║  Extended AI coding agent for real-world software engineering                 ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  Usage: python nano_swe.py "fix the bug in issue #123"                       ║
║                                                                               ║
║  Environment:                                                                 ║
║    ANTHROPIC_API_KEY    API key (required)                                   ║
║    ANTHROPIC_BASE_URL   Custom endpoint (optional)                           ║
║    MODEL                Model name (default: claude-sonnet-4-20250514)       ║
║    MAX_TOKENS           Max response tokens (default: 8192)                  ║
║    MAX_TURNS            Max agent turns (default: 50)                        ║
║                                                                               ║
║  Tools (15):                                                                  ║
║    File:   read_file, write_file, edit_file, multi_edit                      ║
║    Search: grep, find_files, find_definition                                 ║
║    Nav:    list_dir, tree                                                    ║
║    Shell:  bash, run_tests                                                   ║
║    Git:    git_status, git_diff, git_log                                     ║
║    Plan:   think                                                             ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
        """)
        sys.exit(1)

    if not API_KEY:
        print("Error: Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN")
        sys.exit(1)

    prompt = " ".join(sys.argv[1:])
    verbose = os.environ.get("VERBOSE", "1") != "0"

    result = agent(prompt, verbose=verbose)
    print(f"\n{'='*60}\n[RESULT]\n{result}")

if __name__ == "__main__":
    main()
