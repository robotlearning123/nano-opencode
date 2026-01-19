# nano-opencode

A minimal AI coding assistant for the terminal - inspired by OpenCode and Oh My OpenCode.

**10x smaller codebase, 90%+ of the features.**

## Features

- 🤖 **Multi-Model Support**: Works with Claude (Anthropic) and GPT (OpenAI)
- 📁 **File Operations**: Read, write, edit files with intelligent context
- 🔍 **Code Search**: Glob patterns and grep for finding code
- 💬 **Session Management**: Persistent conversation history with SQLite
- 🎯 **Tool Calling**: Autonomous tool execution with streaming responses
- 🚀 **Simple & Fast**: Minimal dependencies, fast startup, easy to understand

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd nano-opencode

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

## Configuration

nano-opencode looks for API keys in environment variables:

```bash
# For Claude (Anthropic)
export ANTHROPIC_API_KEY=your_key_here

# For OpenAI
export OPENAI_API_KEY=your_key_here
```

You can also create a config file at `~/.config/nano-opencode/config.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "maxTokens": 8192,
  "temperature": 0.7
}
```

## Usage

### Interactive Mode

Start an interactive session:

```bash
nano-opencode
# or
noc
```

Available commands in interactive mode:

- `/help` or `/h` - Show help
- `/quit` or `/q` - Exit
- `/clear` or `/c` - Clear screen
- `/new` or `/n` - Start a new session
- `/sessions` or `/s` - List recent sessions
- `/load <id>` - Load a specific session
- `/tools` or `/t` - List available tools

### Single Prompt Mode

Run a single prompt and exit:

```bash
nano-opencode --prompt "Create a hello world program in Python"
```

### Options

- `-p, --provider <name>` - LLM provider (anthropic or openai)
- `-m, --model <name>` - Model to use
- `-s, --session <id>` - Resume a specific session
- `--prompt <text>` - Run a single prompt and exit

## Available Tools

nano-opencode includes these built-in tools:

- **read_file** - Read file contents with line numbers
- **write_file** - Write or overwrite files
- **edit_file** - Replace specific strings in files
- **bash** - Execute shell commands
- **glob** - Find files by pattern (e.g., `*.ts`)
- **grep** - Search file contents with regex
- **list_dir** - List directory contents

## Architecture

nano-opencode is built with simplicity in mind:

```
src/
├── app.ts              # Main entry point
├── cli.ts              # Interactive CLI interface
├── config.ts           # Configuration management
├── store.ts            # Session persistence (SQLite)
├── types.ts            # TypeScript type definitions
├── providers/          # LLM provider implementations
│   ├── anthropic.ts    # Claude/Anthropic integration
│   ├── openai.ts       # OpenAI/GPT integration
│   └── index.ts        # Provider factory
└── tools/              # Tool implementations
    ├── read.ts         # File reading
    ├── writefile.ts    # File writing
    ├── edit.ts         # File editing
    ├── bash.ts         # Shell execution
    ├── glob.ts         # Pattern matching
    ├── grep.ts         # Content search
    ├── list.ts         # Directory listing
    └── index.ts        # Tool registry
```

## Testing

Run the test suite:

```bash
npm test
```

Test coverage includes:
- Configuration loading and saving
- Session management and persistence
- All file operation tools
- Provider message conversion

## Comparison with OpenCode

| Feature | OpenCode | nano-opencode |
|---------|----------|---------------|
| Multi-model support | ✅ | ✅ |
| File operations | ✅ | ✅ |
| Shell execution | ✅ | ✅ |
| Code search | ✅ | ✅ |
| Session management | ✅ | ✅ |
| Rich TUI | ✅ | ❌ Simple CLI |
| LSP support | ✅ | ❌ |
| VS Code extension | ✅ | ❌ |
| Agent modes | ✅ (2) | ❌ |
| Codebase size | ~50K LOC | ~5K LOC |

## Development

```bash
# Run in development mode
npm run dev

# Type check
npm run typecheck

# Build
npm run build
```

## Why nano-opencode?

- **Learning**: Simple, readable codebase perfect for understanding how AI coding assistants work
- **Customization**: Easy to modify and extend
- **Performance**: Fast startup, minimal overhead
- **Portability**: Few dependencies, runs anywhere Node.js runs
- **Focus**: Does one thing well - AI-powered coding in the terminal

## License

MIT

## Credits

Inspired by:
- [OpenCode](https://github.com/anomalyco/opencode) - The open source AI coding agent
- [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode) - Orchestration layer for OpenCode
