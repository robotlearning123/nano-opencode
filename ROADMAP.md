# nano-opencode Roadmap

> **Vision**: The simplest, fastest, most hackable AI coding agent in the world.
> **Goal**: #1 GitHub Trending - The "htop" of AI agents.

## Why nano-opencode Will Win

| Competitor | LOC | Startup | Weakness |
|------------|-----|---------|----------|
| Claude Code | ~50K+ | 500ms+ | Closed source, Claude-only |
| OpenHands | ~100K+ | 2s+ | Heavy, complex setup |
| Aider | ~30K+ | 1s+ | Python-only, no MCP |
| Goose | ~40K+ | 1s+ | Block-controlled |
| **nano-opencode** | **<5K** | **<50ms** | **None - we fix everything** |

## Core Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│  "Do one thing well, make it hackable, ship it fast"        │
│                                                              │
│  • <5K LOC - Anyone can read the entire codebase in 1 hour  │
│  • <50ms startup - Faster than your shell prompt            │
│  • Zero config - Works out of the box                       │
│  • Any model - Not locked to any provider                   │
│  • Any platform - Desktop, server, Pi, embedded, robots     │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Current - Week 1-2)
### Status: ✅ COMPLETE

- [x] Core agent loop with streaming
- [x] 13 essential tools with undo/backup
- [x] Unified JSON-RPC client (MCP + LSP)
- [x] Plugin system (YAML agents, skills, hooks)
- [x] Hooks integration (safety, truncation)
- [x] SIGINT interrupt handler (Ctrl+C)
- [x] Minimal mode for embedded devices
- [x] JSON Schema specs for multi-language

---

## Phase 2: Competitive Parity (Week 3-4)
### Goal: Match Claude Code / Aider core features

### 2.1 Memory System (CLAUDE.md Compatible)
```
Priority: P0 - Critical for adoption
Inspiration: Claude Code's hierarchical CLAUDE.md
```

- [ ] **NANO.md Discovery**
  - `~/.nano/NANO.md` - Global preferences
  - `./NANO.md` - Project-specific context
  - `./subdir/NANO.md` - Directory-scoped rules
  - Recursive loading with path-based scoping

- [ ] **Memory Hooks**
  - PreCompact hook for auto-saving insights
  - Session summarization to NANO.md
  - Vector search for long-term recall (optional)

### 2.2 Plan Mode (Architect Mode)
```
Priority: P0 - Users love this
Inspiration: Claude Code Shift+Tab, Aider /architect
```

- [ ] **Read-Only Planning**
  - `nano --plan` or `/plan` command
  - Analyzes codebase without modifications
  - Generates PLAN.md with implementation steps
  - Diff preview before any file changes

- [ ] **Plan Execution**
  - Step-by-step execution with approval gates
  - Rollback to any step via undo system
  - Plan persistence across sessions

### 2.3 Git Integration (Aider-Style)
```
Priority: P0 - Developers expect this
Inspiration: Aider's automatic commits
```

- [ ] **Auto-Commit**
  - Commit after each successful change
  - AI-generated commit messages
  - `--no-auto-commit` flag to disable

- [ ] **Git-Aware Context**
  - Auto-include modified files in context
  - `git diff` as context for reviews
  - Branch-aware operations

### 2.4 Multi-Model Support
```
Priority: P0 - Critical differentiator
Inspiration: OpenCode's 75+ providers
```

- [ ] **Provider Expansion**
  - [ ] Ollama (local models)
  - [ ] OpenRouter (100+ models)
  - [ ] Groq (fast inference)
  - [ ] Together AI
  - [ ] AWS Bedrock
  - [ ] Azure OpenAI

- [ ] **Model Routing**
  - Fast model for simple tasks (Haiku, GPT-4o-mini)
  - Powerful model for complex tasks (Opus, GPT-4)
  - Cost optimization mode

---

## Phase 3: Differentiation (Week 5-8)
### Goal: Features no one else has

### 3.1 Subagent System
```
Priority: P1 - Major differentiator
Inspiration: Claude Code subagents, Cursor 2.0 parallel agents
```

- [ ] **Specialized Subagents**
  ```yaml
  # builtin/subagents/security-review.yaml
  name: security-review
  type: subagent
  model: claude-sonnet  # Can use different model
  tools: [read_file, grep, glob]  # Limited tools
  prompt: |
    You are a security auditor. Review code for:
    - SQL injection, XSS, CSRF
    - Secrets in code
    - Insecure dependencies
  ```

- [ ] **Parallel Execution**
  - Launch multiple subagents simultaneously
  - Aggregate results from parallel searches
  - Progress tracking per subagent

- [ ] **Subagent Marketplace**
  - Community-contributed subagents
  - One-command install: `nano install @user/subagent`

### 3.2 MCP Tool Search (Lazy Loading)
```
Priority: P1 - Massive context savings
Inspiration: Claude Code's MCP Tool Search innovation
```

- [ ] **Tool Index**
  - Build lightweight index of all MCP tools
  - ~100 tokens instead of ~50K for tool definitions
  - Search index when tool needed

- [ ] **Dynamic Tool Loading**
  - Load tool definition only when called
  - Unload unused tools from context
  - Monitor context usage in real-time

### 3.3 Skills 2.0 (Portable Knowledge Packages)
```
Priority: P1 - Community growth driver
Inspiration: Claude Code Agent Skills, MCP
```

- [ ] **Enhanced Skill Format**
  ```markdown
  ---
  name: react-component
  version: 1.0.0
  author: community
  tags: [react, frontend, typescript]
  tools: [read_file, write_file, bash]
  mcp_servers: [typescript-lsp]  # Auto-start dependencies
  ---

  # React Component Generator

  ## Level 1: Metadata (always loaded)
  Creates production-ready React components.

  ## Level 2: Core Instructions (loaded when invoked)
  {{include: ./instructions.md}}

  ## Level 3: Examples (loaded on-demand)
  {{include: ./examples/}}
  ```

- [ ] **Skill Registry**
  - `nano skill search <query>`
  - `nano skill install <name>`
  - `nano skill publish`

### 3.4 Browser Automation
```
Priority: P2 - Unique capability
Inspiration: OpenHands VNC, Cline browser actions
```

- [ ] **Playwright Integration**
  - `browser_navigate`, `browser_click`, `browser_screenshot`
  - Visual debugging for web apps
  - E2E test generation

### 3.5 Voice Mode
```
Priority: P2 - Accessibility & innovation
Inspiration: Aider voice support
```

- [ ] **Speech-to-Text Input**
  - Whisper API integration
  - Local Whisper for privacy
  - Wake word activation

---

## Phase 4: Platform Expansion (Week 9-12)
### Goal: Run everywhere

### 4.1 Multi-Language Implementations
```
Priority: P1 - Community growth
Core insight: The agent loop is <100 LOC in any language!
```

#### Current Implementations (DONE!)
| File | LOC | Language | Dependencies | Platforms |
|------|-----|----------|--------------|-----------|
| `nano.py` | **71** | Python | None (stdlib) | All (Pi, embedded, WASM) |
| `nano-minimal.ts` | **85** | TypeScript | None (fetch) | Node 18+, Bun, Deno |
| `nano.ts` | **210** | TypeScript | Anthropic SDK | Node, Bun |
| `src/` | ~5K | TypeScript | Full deps | Desktop, server |

#### Feature Tiers
| Tier | LOC | Features |
|------|-----|----------|
| **Micro** | 70-100 | 5 tools, single-turn, zero deps |
| **Mini** | 200-300 | 7 tools, agent loop, REPL |
| **Standard** | 500-1K | 10+ tools, sessions, multi-provider |
| **Full** | 2-3K | MCP, LSP, plugins, hooks |

#### Planned Implementations
- [x] **Python Micro** (71 LOC) - ✅ DONE
  - Zero dependencies, runs on Raspberry Pi
  - `python nano.py "your prompt"`

- [x] **TypeScript Micro** (85 LOC) - ✅ DONE
  - Zero SDK deps, uses raw fetch
  - `bun nano-minimal.ts "your prompt"`

- [ ] **Rust Micro** (~100 LOC)
  - Target: Embedded, IoT, robotics
  - no_std variant for microcontrollers
  - Cross-compile for ARM, ESP32

- [ ] **Go Micro** (~90 LOC)
  - Target: Cloud/DevOps, single binary
  - Docker-native, K8s friendly

- [ ] **Zig Micro** (~150 LOC)
  - Target: Embedded, WASM, game dev
  - C interop for legacy systems

- [ ] **C Micro** (~300 LOC)
  - Target: Bare metal, MCU
  - Minimal memory footprint

- [ ] **Lua Micro** (~80 LOC)
  - Target: Neovim plugin
  - Native Lua integration

### 4.2 IDE Integrations
```
Priority: P1 - Adoption driver
```

- [ ] **VS Code Extension**
  - Inline diff preview
  - Chat panel
  - Status bar with token usage

- [ ] **Neovim Plugin**
  - Lua-native integration
  - Telescope integration
  - Minimal, keyboard-driven

- [ ] **JetBrains Plugin**
  - IntelliJ, PyCharm, WebStorm
  - Native UI integration

### 4.3 Hardware Integrations
```
Priority: P2 - Unique market position
```

- [ ] **ROS2 Integration**
  - Robot control via MCP
  - Sensor data as context
  - Navigation commands

- [ ] **Home Assistant**
  - Smart home automation
  - Voice-controlled coding
  - IoT device control

- [ ] **Raspberry Pi Optimization**
  - Memory-optimized mode
  - GPIO tool support
  - Camera integration

---

## Phase 5: Enterprise & Scale (Week 13+)
### Goal: Production-ready for teams

### 5.1 Team Features
- [ ] **Shared Memory**
  - Team-wide NANO.md
  - Shared skill libraries
  - Usage analytics

- [ ] **Access Control**
  - Tool permissions per user
  - Audit logging
  - SSO integration

### 5.2 Cloud Mode
- [ ] **nano cloud**
  - Remote agent execution
  - Persistent sessions
  - Team collaboration

### 5.3 CI/CD Integration
- [ ] **GitHub Actions**
  - `/nano` comment trigger
  - PR review automation
  - Auto-fix suggestions

---

## Success Metrics

### GitHub Trending Criteria
| Metric | Target | Strategy |
|--------|--------|----------|
| Stars | 10K+ in 3 months | Launch on HN, Reddit, Twitter |
| Forks | 1K+ | Easy contribution, good docs |
| Contributors | 100+ | Good first issues, welcoming |
| Daily Active | 5K+ | Solve real problems |

### Technical Metrics
| Metric | Current | Target |
|--------|---------|--------|
| Startup Time | 27ms | <50ms |
| Memory Usage | ~50MB | <30MB |
| LOC (TypeScript) | ~7.8K | <5K |
| Test Coverage | 74 tests | 200+ tests |
| Model Support | 3 | 20+ |

### Community Metrics
| Metric | Target |
|--------|--------|
| Discord Members | 5K+ |
| Skill Packages | 100+ |
| MCP Servers | 50+ |
| Tutorials/Blogs | 50+ |

---

## Immediate TODOs (This Week)

### High Priority
1. [ ] Implement NANO.md memory system
2. [ ] Add Plan Mode (`/plan` command)
3. [ ] Add Ollama provider (local models)
4. [ ] Add auto-commit git integration
5. [ ] Create VS Code extension skeleton

### Medium Priority
6. [ ] Add OpenRouter provider (100+ models)
7. [ ] Implement subagent spawning
8. [ ] Add MCP tool search/lazy loading
9. [ ] Create skill registry CLI

### Documentation
10. [ ] Write comprehensive README
11. [ ] Create "5-minute quickstart" guide
12. [ ] Document plugin development
13. [ ] Record demo videos

---

## Competitive Moat

### Why Fork nano-opencode Instead of Others?

1. **Simplicity**: 5K LOC vs 50K+ - You can understand everything
2. **Speed**: 50ms startup vs 2s - Instant response
3. **Hackability**: YAML configs, no rebuild needed
4. **Portability**: Same code runs on Mac, Linux, Pi, robots
5. **Freedom**: Any model, any provider, no lock-in
6. **Community**: Skills marketplace, MCP ecosystem

### Tagline Options
- "The htop of AI agents"
- "5K lines to rule them all"
- "AI coding, without the bloat"
- "From terminal to robot, one agent"

---

## Architecture Decision Records

### ADR-001: Why TypeScript First?
- Largest developer community
- Easy to contribute
- Good async/await support
- Easy to port to other languages

### ADR-002: Why YAML for Plugins?
- Human-readable
- Multi-line strings for prompts
- No compilation needed
- OpenCode compatible

### ADR-003: Why Unified RPC?
- MCP and LSP both use JSON-RPC 2.0
- Reduces code duplication
- Easier to maintain
- Single abstraction for all services

### ADR-004: Why Lazy Loading?
- <50ms startup requirement
- Embedded device support
- Context window efficiency
- Pay only for what you use
