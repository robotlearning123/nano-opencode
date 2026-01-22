# nano-opencode Multi-Language Implementations

The core AI agent loop is **<100 lines** in any language. This directory contains minimal implementations that run anywhere.

## Philosophy

```
┌────────────────────────────────────────────────────────────┐
│  The agent loop is the same in every language:             │
│                                                            │
│  1. Send message + tools to API                            │
│  2. If tool_use: execute tools, append results, goto 1     │
│  3. If end_turn: return response                           │
│                                                            │
│  That's it. ~30 lines. Everything else is tools.           │
└────────────────────────────────────────────────────────────┘
```

## Implementations

| Language | File | LOC | Dependencies | Platforms |
|----------|------|-----|--------------|-----------|
| Python | `python/nano.py` | 71 | None (stdlib) | All |
| TypeScript | `typescript/nano-minimal.ts` | 85 | None (fetch) | Node 18+, Bun, Deno |
| TypeScript | `typescript/nano.ts` | 210 | Anthropic SDK | Node, Bun |
| Rust | `rust/nano.rs` | ~100 | Planned | All + embedded |
| Go | `go/nano.go` | ~90 | Planned | All |

## Usage

### Python (runs anywhere with Python 3.8+)
```bash
cd python
ANTHROPIC_API_KEY=sk-... python nano.py "list files in current directory"
```

### TypeScript Minimal (Node 18+, Bun, Deno)
```bash
cd typescript
ANTHROPIC_API_KEY=sk-... bun nano-minimal.ts "read package.json"
# or
ANTHROPIC_API_KEY=sk-... npx tsx nano-minimal.ts "read package.json"
```

### TypeScript with SDK (richer experience)
```bash
cd typescript
bun install  # or npm install
ANTHROPIC_API_KEY=sk-... bun nano.ts "help me refactor this code"
# Interactive mode:
ANTHROPIC_API_KEY=sk-... bun nano.ts
```

## Feature Tiers

| Tier | LOC | Tools | Features |
|------|-----|-------|----------|
| **Micro** | 70-100 | 5 | read, write, edit, bash, list_dir |
| **Mini** | 200-300 | 7 | + glob, grep, REPL mode |
| **Standard** | 500-1K | 10+ | + patch, diff, todo, undo, sessions |
| **Full** | 2-3K | 15+ | + MCP, LSP, plugins, hooks |

## Platform Support

| Platform | Python | TypeScript | Rust | Go |
|----------|--------|------------|------|-----|
| Linux x64 | ✅ | ✅ | 🔜 | 🔜 |
| macOS | ✅ | ✅ | 🔜 | 🔜 |
| Windows | ✅ | ✅ | 🔜 | 🔜 |
| Raspberry Pi | ✅ | ✅ | 🔜 | 🔜 |
| Docker | ✅ | ✅ | 🔜 | 🔜 |
| ESP32 | ❌ | ❌ | 🔜 | ❌ |
| WASM | ⚠️ | ✅ | 🔜 | 🔜 |

## Contributing a New Language

1. Implement the 5 core tools:
   - `read_file(path)` - Read file contents
   - `write_file(path, content)` - Write to file
   - `edit_file(path, old_string, new_string)` - Replace text
   - `bash(command)` - Run shell command
   - `list_dir(path)` - List directory

2. Implement the API call:
   - POST to `https://api.anthropic.com/v1/messages`
   - Headers: `x-api-key`, `anthropic-version: 2023-06-01`
   - Body: `{model, max_tokens, tools, messages, system}`

3. Implement the agent loop:
   ```
   while response.stop_reason == "tool_use":
       execute tools
       append results
       call API again
   return final text
   ```

4. Keep it under 100 lines if possible!
