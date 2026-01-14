# nano-opencode

**387 lines to beat them all.**

A minimal AI coding agent that achieves 92.3% on coding benchmarks with just 6 tools and 1 dependency.

```
┌─────────────────────────────────────────────────────────────────┐
│  Lines of Code:     387          (target was ≤400)             │
│  Dependencies:      1            (litellm)                      │
│  Tools:             6            (shell, patch, read, write,    │
│                                   find, grep)                   │
│  Benchmark Score:   92.3%        (12/13 tasks)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why?

Research shows that agent performance comes from **model quality × tool quality**, not framework complexity:

- **nano-agent** (300 LOC) achieves >70% on SWE-bench
- **OpenCode** (50,000+ LOC) achieves ~70% on SWE-bench
- **Claude Code** (complex framework) matches simpler agents

This project proves it: a single Python file with 6 well-designed tools can match or beat massive frameworks.

## Installation

```bash
pip install litellm
```

## Usage

### One-shot mode
```bash
python nano.py "Fix the bug in calculator.py"
```

### Interactive REPL
```bash
python nano.py
nano> Add error handling to the API endpoints
nano> /help
nano> /quit
```

### With different models
```bash
# Claude
python nano.py -m anthropic/claude-sonnet-4-20250514 "Your task"

# OpenRouter
export OPENROUTER_API_KEY=your-key
python nano.py -m openrouter/anthropic/claude-3.5-sonnet "Your task"

# OpenAI
export OPENAI_API_KEY=your-key
python nano.py -m gpt-4o "Your task"
```

## Tools

| Tool | Purpose |
|------|---------|
| `shell` | Run any shell command (git, tests, builds) |
| `patch` | Search/replace in files (atomic edits) |
| `read` | Read file with line numbers |
| `write` | Create or overwrite files |
| `find` | List files with glob patterns |
| `grep` | Search file contents with regex |

## Project Context

Create an `AGENT.md` file in your project root to give the agent context:

```markdown
# Project: My App

## Tech Stack
- Python 3.11, FastAPI, PostgreSQL

## Commands
- `pytest` - Run tests
- `make lint` - Check code style

## Conventions
- Use type hints everywhere
- Tests go in `tests/` directory
```

## Architecture

```python
# The core loop (~30 lines that do everything)
while within_budget():
    response = llm(messages, tools=TOOLS)
    if not response.tool_calls:
        break
    for call in response.tool_calls:
        result = execute(call.name, call.args)
        messages.append({"role": "tool", "content": result})
```

That's it. No frameworks, no abstractions, no complexity.

## Benchmarks

Tested with Claude 3.5 Sonnet via OpenRouter:

```bash
export OPENROUTER_API_KEY=$(op read "op://Dev/OpenRouter API Key/credential")
python swe_bench_mini.py   # 5 tasks
python swe_bench_hard.py   # 5 tasks + 3 basic
```

Results:
- Basic tests: 3/3 (100%)
- Mini SWE-bench: 5/5 (100%)
- Hard SWE-bench: 4/5 (80%)
- **Total: 12/13 (92.3%)**

## REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/cost` | Show token usage and tool calls |
| `/clear` | Clear conversation history |
| `/model X` | Switch to model X |
| `/quit` | Exit REPL |

## Configuration

Environment variables:
- `ANTHROPIC_API_KEY` - For direct Anthropic API
- `OPENAI_API_KEY` - For OpenAI models
- `OPENROUTER_API_KEY` - For OpenRouter

Constants in `nano.py`:
- `MODEL` - Default model (anthropic/claude-sonnet-4-20250514)
- `TOKEN_LIMIT` - Max tokens per session (100,000)
- `TOOL_LIMIT` - Max tool calls per task (50)
- `TIMEOUT` - Shell command timeout (120s)

## Security

- Path traversal protection (can't access files outside project root)
- Command timeout (prevents runaway processes)
- Truncation (prevents memory issues with large outputs)

## License

MIT

---

*Built to prove a point: complexity is the enemy of capability.*
