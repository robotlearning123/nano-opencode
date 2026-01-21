# nano-opencode Project Context

## Project Overview
nano-opencode is a minimal AI coding assistant (<5K LOC) with <50ms startup time.
Future name: "jarvis" (inspired by Iron Man's AI assistant)

## Architecture Decisions
- TypeScript reference implementation (target: <3K LOC)
- YAML-based plugin system for agents, skills, hooks
- Unified JSON-RPC 2.0 client for MCP and LSP
- Lazy loading everywhere for performance
- SQLite for session persistence

## Coding Standards
- Use `bun` for package management and running
- Tests: `npm test` (node:test built-in)
- Prefer functional style over classes where possible
- Keep files under 300 LOC
- No emojis in code comments

## Key Directories
- `src/` - Core TypeScript implementation
- `builtin/agents/` - Essential YAML agent definitions
- `specs/interfaces/` - JSON Schema specifications
- `test/` - Test files (*.test.ts)

## Important Files
- `src/cli.ts` - Main CLI REPL with interrupt handling
- `src/agents/index.ts` - Agent system with memory injection
- `src/memory/index.ts` - NANO.md memory system
- `src/rpc/client.ts` - Unified JSON-RPC for MCP/LSP

## Related Projects
- jarvis: Future merge target at /home/robot/workspace/26-nano-opencode/jarvis

## Current Phase
Phase 2: Competitive Parity
- [x] NANO.md memory system
- [ ] Plan Mode (/plan command)
- [ ] Ollama provider (local models)
- [ ] Auto-commit git integration
