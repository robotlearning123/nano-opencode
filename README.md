# nano-opencode

> A minimal yet powerful AI coding assistant for the terminal.

## Quick Start

```bash
# Install (bun recommended for speed)
git clone https://github.com/robotlearning123/nano-opencode.git
cd nano-opencode && bun install

# Set API key (choose one)
export ANTHROPIC_API_KEY=your_key
export OPENAI_API_KEY=your_key
export GEMINI_API_KEY=your_key

# Run
bun dev                    # Development (fastest, no build)
bun run build && bun start # Production
```

## Features

| Feature | Description |
|---------|-------------|
| **Multi-Provider** | Anthropic, OpenAI, Gemini |
| **16 Tools** | File ops, search, bash, diff, patch, LSP, and more |
| **10 Agents** | Specialized agents for different tasks |
| **Hooks** | Lifecycle hooks for extensibility |
| **Skills** | Template-based prompt system |
| **MCP** | Model Context Protocol support |
| **Sessions** | SQLite-persisted conversation history |
| **Security** | Path traversal protection, dangerous command detection |

## Usage

### Interactive Mode

```bash
npm start        # or: node dist/app.js
```

### Single Prompt

```bash
npm start -- --prompt "explain this codebase"
```

### Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/agent [name]` | List or switch agents |
| `/tools` | List available tools |
| `/sessions` | List recent sessions |
| `/new` | Start new session |
| `/mcp` | List MCP servers |
| `/skill [name]` | List or show skills |
| `/connect [provider]` | Configure provider auth |
| `/quit` | Exit |

## Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file with line numbers |
| `write_file` | Create or overwrite file |
| `edit_file` | Find and replace in file |
| `bash` | Execute shell command |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `list_dir` | List directory |
| `diff` | Compare files or content |
| `patch` | Atomic multi-file edits |
| `todo` | Manage task list |
| `webfetch` | Fetch URL content |
| `skill` | Execute a skill |
| `session` | Session management |
| `lsp_*` | LSP code intelligence |

## Agents

| Agent | Purpose |
|-------|---------|
| `sisyphus` | Full-capability orchestrator (default) |
| `oracle` | Read-only advisor |
| `librarian` | Documentation explorer |
| `explore` | Codebase search |
| `junior` | Simple task executor |
| `prometheus` | Strategic planner |
| `metis` | Pre-planning consultant |
| `momus` | Plan reviewer |
| `frontend` | UI development |
| `multimodal` | Image/PDF analysis |

## Configuration

Create `~/.config/nano-opencode/config.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "maxTokens": 8192,
  "temperature": 0.7
}
```

Or use environment variables:

```bash
export ANTHROPIC_API_KEY=sk-...
export OPENAI_API_KEY=sk-...
export GEMINI_API_KEY=AI...
```

## Architecture

```
src/
├── app.ts           # Entry point
├── cli.ts           # Interactive CLI
├── config.ts        # Configuration
├── store.ts         # SQLite persistence
├── utils.ts         # Security utilities
├── agents/          # 10 built-in agents
├── hooks/           # Lifecycle hooks
├── skills/          # Skill templates
├── providers/       # Anthropic, OpenAI, Gemini
├── tools/           # 16 tools
├── mcp/             # Model Context Protocol
└── ui/              # Terminal formatting
```

## Development

```bash
bun dev          # Run directly (no build needed)
bun run test     # Run tests (74 passing)
bun run build    # Build TypeScript
bun run typecheck # Type check only
```

## Stats

| Metric | Value |
|--------|-------|
| Lines | ~7,000 TypeScript |
| Files | 51 source files |
| Tests | 74 passing |
| Startup | <70ms (bun) |
| Install | ~5s (bun) |

## License

MIT

---

*Simple tools, clear prompts, powerful results.*
