#!/usr/bin/env bun
/**
 * nano-opencode SWE-bench: Extended AI coding agent for real-world software engineering (~300 LOC)
 * Capable of solving GitHub issues, debugging, refactoring, and passing SWE-bench evaluations.
 *
 * Usage: ANTHROPIC_API_KEY=sk-... bun nano-swe.ts "fix the bug in issue #123"
 *
 * Note: This agent intentionally uses shell execution for flexibility. In production,
 * consider using execFile with argument arrays for user-provided inputs.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "";
const MODEL = process.env.MODEL || "claude-sonnet-4-20250514";
const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const API_URL = `${BASE_URL.replace(/\/$/, "")}/v1/messages`;
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "8192");
const MAX_TURNS = parseInt(process.env.MAX_TURNS || "50");

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS - 15 tools for SWE-bench level tasks
// ═══════════════════════════════════════════════════════════════════════════════

const TOOLS = [
  // === File Operations ===
  { name: "read_file", description: "Read file content. Use line_start/line_end for large files.",
    input_schema: { type: "object", properties: {
      path: { type: "string", description: "File path" },
      line_start: { type: "integer", description: "Start line (1-indexed, optional)" },
      line_end: { type: "integer", description: "End line (optional)" }
    }, required: ["path"] }},

  { name: "write_file", description: "Create or overwrite file",
    input_schema: { type: "object", properties: {
      path: { type: "string" }, content: { type: "string" }
    }, required: ["path", "content"] }},

  { name: "edit_file", description: "Replace exact string in file. old_string must match exactly.",
    input_schema: { type: "object", properties: {
      path: { type: "string" },
      old_string: { type: "string", description: "Exact text to find (include enough context)" },
      new_string: { type: "string", description: "Replacement text" }
    }, required: ["path", "old_string", "new_string"] }},

  { name: "multi_edit", description: "Apply multiple edits atomically. All edits succeed or all fail.",
    input_schema: { type: "object", properties: {
      edits: { type: "array", items: { type: "object", properties: {
        path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }
      }, required: ["path", "old_string", "new_string"] }}
    }, required: ["edits"] }},

  // === Code Search ===
  { name: "grep", description: "Search file contents with regex. Returns matching lines with context.",
    input_schema: { type: "object", properties: {
      pattern: { type: "string", description: "Regex pattern" },
      path: { type: "string", description: "File or directory to search (default: .)" },
      include: { type: "string", description: "File pattern, e.g. '*.py'" },
      context: { type: "integer", description: "Lines of context (default: 2)" }
    }, required: ["pattern"] }},

  { name: "find_files", description: "Find files by name pattern",
    input_schema: { type: "object", properties: {
      pattern: { type: "string", description: "Glob pattern, e.g. '**/*.py' or 'test_*.py'" },
      path: { type: "string", description: "Directory to search (default: .)" }
    }, required: ["pattern"] }},

  { name: "find_definition", description: "Find function/class/variable definition in codebase",
    input_schema: { type: "object", properties: {
      name: { type: "string", description: "Symbol name to find" },
      type: { type: "string", enum: ["function", "class", "variable", "any"], description: "Symbol type" }
    }, required: ["name"] }},

  // === Directory Operations ===
  { name: "list_dir", description: "List directory contents with file sizes",
    input_schema: { type: "object", properties: {
      path: { type: "string", description: "Directory path (default: .)" },
      recursive: { type: "boolean", description: "List recursively (default: false)" },
      max_depth: { type: "integer", description: "Max depth for recursive (default: 3)" }
    }, required: [] }},

  { name: "tree", description: "Show directory tree structure",
    input_schema: { type: "object", properties: {
      path: { type: "string", description: "Directory path (default: .)" },
      max_depth: { type: "integer", description: "Max depth (default: 3)" },
      include: { type: "string", description: "Include pattern (e.g. '*.py')" }
    }, required: [] }},

  // === Shell & Testing ===
  { name: "bash", description: "Run shell command. Use for git, pip, make, etc.",
    input_schema: { type: "object", properties: {
      command: { type: "string" },
      timeout: { type: "integer", description: "Timeout in seconds (default: 120)" },
      cwd: { type: "string", description: "Working directory" }
    }, required: ["command"] }},

  { name: "run_tests", description: "Run test suite and return results",
    input_schema: { type: "object", properties: {
      test_path: { type: "string", description: "Test file/dir (default: auto-detect)" },
      pattern: { type: "string", description: "Test name pattern" },
      verbose: { type: "boolean", description: "Verbose output" }
    }, required: [] }},

  // === Git Operations ===
  { name: "git_status", description: "Show git status (modified, staged, untracked files)",
    input_schema: { type: "object", properties: {}, required: [] }},

  { name: "git_diff", description: "Show git diff of changes",
    input_schema: { type: "object", properties: {
      path: { type: "string", description: "File path (optional, default: all)" },
      staged: { type: "boolean", description: "Show staged changes" }
    }, required: [] }},

  { name: "git_log", description: "Show recent commits",
    input_schema: { type: "object", properties: {
      count: { type: "integer", description: "Number of commits (default: 10)" },
      path: { type: "string", description: "File path (optional)" }
    }, required: [] }},

  // === Context & Planning ===
  { name: "think", description: "Record your reasoning without taking action. Use for complex problems.",
    input_schema: { type: "object", properties: {
      thought: { type: "string", description: "Your analysis or reasoning" }
    }, required: ["thought"] }},
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function truncate(s: string, maxLen = 50000): string {
  return s.length > maxLen ? s.slice(0, maxLen) + `\n...[truncated ${s.length - maxLen} chars]` : s;
}

function runCmd(cmd: string, timeout = 120000, cwd?: string): string {
  try {
    return truncate(execSync(cmd, { encoding: "utf-8", timeout, cwd, maxBuffer: 10 * 1024 * 1024 }));
  } catch (e: any) {
    return e.stdout || e.stderr || `Error: ${e.message}`;
  }
}

function runTool(name: string, args: any): string {
  try {
    // === File Operations ===
    if (name === "read_file") {
      if (!existsSync(args.path)) return `Error: File not found: ${args.path}`;
      const content = readFileSync(args.path, "utf-8");
      const lines = content.split("\n");
      const start = (args.line_start || 1) - 1;
      const end = args.line_end || lines.length;
      const selected = lines.slice(start, end);
      const numbered = selected.map((line, i) => `${String(i + start + 1).padStart(4)} | ${line}`);
      return truncate(numbered.join("\n"));
    }

    if (name === "write_file") {
      const dir = dirname(args.path);
      if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(args.path, args.content);
      return `OK: Wrote ${args.content.length} chars to ${args.path}`;
    }

    if (name === "edit_file") {
      if (!existsSync(args.path)) return `Error: File not found: ${args.path}`;
      const content = readFileSync(args.path, "utf-8");
      if (!content.includes(args.old_string)) {
        const lines = content.split("\n").filter(l =>
          args.old_string.split(/\s+/).slice(0, 3).some((w: string) => l.includes(w))
        );
        const hint = lines.length ? `\nSimilar lines:\n${lines.slice(0, 5).join("\n")}` : "";
        return `Error: old_string not found in ${args.path}${hint}`;
      }
      const escaped = args.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const count = (content.match(new RegExp(escaped, 'g')) || []).length;
      if (count > 1) return `Error: old_string appears ${count} times. Add more context to make it unique.`;
      writeFileSync(args.path, content.replace(args.old_string, args.new_string));
      return `OK: Edited ${args.path}`;
    }

    if (name === "multi_edit") {
      const backups: Record<string, string> = {};
      for (const edit of args.edits) {
        if (!existsSync(edit.path)) return `Error: File not found: ${edit.path}`;
        const content = readFileSync(edit.path, "utf-8");
        if (!content.includes(edit.old_string)) return `Error: old_string not found in ${edit.path}`;
        backups[edit.path] = content;
      }
      try {
        for (const edit of args.edits) {
          const content = readFileSync(edit.path, "utf-8");
          writeFileSync(edit.path, content.replace(edit.old_string, edit.new_string));
        }
        return `OK: Applied ${args.edits.length} edits`;
      } catch (e: any) {
        for (const [path, content] of Object.entries(backups)) writeFileSync(path, content);
        return `Error: ${e.message} (rolled back all changes)`;
      }
    }

    // === Code Search ===
    if (name === "grep") {
      const path = args.path || ".";
      const ctx = args.context || 2;
      const include = args.include ? `--include='${args.include}'` : "";
      return runCmd(`grep -rn -E '${args.pattern}' ${path} ${include} -B${ctx} -A${ctx} 2>/dev/null | head -200`) || "No matches found";
    }

    if (name === "find_files") {
      const path = args.path || ".";
      let result = runCmd(`find ${path} -type f -name '${args.pattern}' 2>/dev/null | head -100`);
      if (!result.trim()) result = runCmd(`find ${path} -type f -path '*${args.pattern}*' 2>/dev/null | head -100`);
      return result || "No files found";
    }

    if (name === "find_definition") {
      const sym = args.name;
      const patterns: Record<string, string> = {
        function: `(def|function|fn|func)\\s+${sym}\\s*\\(`,
        class: `(class|struct|interface|type)\\s+${sym}`,
        variable: `(let|const|var|val)\\s+${sym}\\s*=`,
        any: `(def|class|function|fn|func|struct|interface|type|let|const|var)\\s+${sym}`
      };
      const pattern = patterns[args.type || "any"];
      return runCmd(`grep -rn -E '${pattern}' . --include='*.py' --include='*.js' --include='*.ts' --include='*.go' --include='*.rs' 2>/dev/null | head -50`) || `No definition found for '${sym}'`;
    }

    // === Directory Operations ===
    if (name === "list_dir") {
      const path = args.path || ".";
      if (!existsSync(path)) return `Error: Directory not found: ${path}`;
      if (args.recursive) return runCmd(`find ${path} -maxdepth ${args.max_depth || 3} -type f -exec ls -lh {} \\; 2>/dev/null | head -200`);
      const items = readdirSync(path).filter(n => !n.startsWith(".")).map(name => {
        const full = join(path, name);
        const stat = statSync(full);
        return `${stat.isDirectory() ? "d" : "-"} ${String(stat.size).padStart(8)}  ${name}`;
      });
      return items.join("\n") || "(empty directory)";
    }

    if (name === "tree") {
      const path = args.path || ".";
      const depth = args.max_depth || 3;
      const include = args.include ? `-P '${args.include}'` : "";
      return truncate(runCmd(`tree -L ${depth} ${include} --noreport ${path} 2>/dev/null || find ${path} -maxdepth ${depth} -print 2>/dev/null`));
    }

    // === Shell & Testing ===
    if (name === "bash") return runCmd(args.command, (args.timeout || 120) * 1000, args.cwd);

    if (name === "run_tests") {
      const testPath = args.test_path || "";
      const pattern = args.pattern || "";
      const verbose = args.verbose ? "-v" : "";
      let cmd: string;
      if (existsSync("pytest.ini") || existsSync("pyproject.toml") || existsSync("setup.py")) {
        cmd = `python -m pytest ${testPath} ${pattern ? `-k '${pattern}'` : ""} ${verbose} --tb=short 2>&1`;
      } else if (existsSync("package.json")) {
        cmd = `npm test -- ${testPath} 2>&1`;
      } else if (existsSync("Cargo.toml")) {
        cmd = `cargo test ${testPath} 2>&1`;
      } else if (existsSync("go.mod")) {
        cmd = `go test ./... ${verbose} 2>&1`;
      } else {
        cmd = `python -m pytest ${testPath} ${verbose} --tb=short 2>&1`;
      }
      return truncate(runCmd(cmd, 300000));
    }

    // === Git Operations ===
    if (name === "git_status") return runCmd("git status --short && echo '---' && git diff --stat HEAD 2>/dev/null");
    if (name === "git_diff") return truncate(runCmd(`git diff ${args.staged ? "--staged" : ""} ${args.path || ""}`));
    if (name === "git_log") return runCmd(`git log --oneline -n ${args.count || 10} ${args.path || ""}`);

    // === Context & Planning ===
    if (name === "think") return `[Thought recorded: ${args.thought.slice(0, 100)}...]`;

    return `Error: Unknown tool '${name}'`;
  } catch (e: any) {
    return `Error: ${e.name}: ${e.message}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT LOOP
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are an expert software engineer solving real-world GitHub issues.

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
- If tests fail, analyze and fix before declaring done`;

async function callApi(messages: any[]): Promise<any> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, tools: TOOLS, messages, system: SYSTEM_PROMPT })
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function agent(prompt: string, verbose = true): Promise<string> {
  const messages: any[] = [{ role: "user", content: prompt }];
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    if (verbose) console.log(`\n${"=".repeat(60)}\n[Turn ${turn}/${MAX_TURNS}]`);
    let response: any;
    try { response = await callApi(messages); } catch (e: any) { return `Error: API call failed: ${e.message}`; }
    messages.push({ role: "assistant", content: response.content });
    for (const block of response.content) {
      if (block.type === "text" && block.text && verbose) console.log(`\n${block.text.slice(0, 500)}${block.text.length > 500 ? "..." : ""}`);
    }
    if (response.stop_reason !== "tool_use") return response.content.filter((b: any) => b.type === "text").map((b: any) => b.text || "").join("");
    const results: any[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        if (verbose) console.log(`\n⚡ ${block.name}: ${JSON.stringify(block.input).slice(0, 80)}...`);
        const result = runTool(block.name, block.input);
        if (verbose) console.log(`   → ${result.slice(0, 200)}${result.length > 200 ? "..." : ""}`);
        results.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return "Error: Max turns exceeded";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

if (process.argv.length < 3) {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  nano-opencode SWE-bench Agent (TypeScript)                                   ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  Usage: bun nano-swe.ts "fix the bug in issue #123"                          ║
║                                                                               ║
║  Tools (15): read_file, write_file, edit_file, multi_edit, grep, find_files, ║
║              find_definition, list_dir, tree, bash, run_tests, git_status,   ║
║              git_diff, git_log, think                                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝`);
  process.exit(1);
}
if (!API_KEY) { console.error("Error: Set ANTHROPIC_API_KEY"); process.exit(1); }
agent(process.argv.slice(2).join(" ")).then(r => console.log(`\n${"=".repeat(60)}\n[RESULT]\n${r}`));
