# TUI Comparison: nano-opencode vs OpenCode vs Oh My OpenCode

## Basic Info

| Metric | nano-opencode | opencode | oh-my-opencode |
|--------|---------------|----------|----------------|
| Version | 0.0.1 | 1.1.23 | 3.0.0-beta.4 |
| Language | TypeScript | Go | TypeScript |
| TUI LOC | ~320 lines | ~10,000+ lines | ~5,000+ lines |
| Binary Size | N/A (source) | 139 MB | N/A (npm) |
| Dependencies | 8 runtime | Built-in (Go) | 20+ npm packages |

## Startup Time

| Tool | Cold Start | Help Command | Notes |
|------|------------|--------------|-------|
| nano-opencode | ~216ms | ~200ms | Node.js + tsx |
| opencode | ~349ms | ~350ms | Go binary |
| oh-my-opencode | ~39ms | ~40ms | Wrapper script |

## Features

| Feature | nano-opencode | opencode | oh-my-opencode |
|---------|---------------|----------|----------------|
| TUI Chat | ✓ Basic | ✓ Advanced | ✓ Wrapper |
| Multi-provider | ✓ 3 providers | ✓ 10+ providers | ✓ Multi-model |
| MCP Support | ✓ Optional | ✓ Built-in | ✓ Enhanced |
| LSP Support | ✓ Optional | ✓ Built-in | ✓ Built-in |
| Tool Use | ✓ Basic | ✓ Advanced | ✓ Advanced |
| Sessions | ✓ SQLite | ✓ Built-in | ✓ Wrapper |
| Web UI | ✗ | ✓ Built-in | ✗ |
| GitHub PR | ✗ | ✓ Built-in | ✓ Enhanced |
| ACP Server | ✗ | ✓ Built-in | ✗ |
| mDNS Discovery | ✗ | ✓ Built-in | ✗ |
| Stats/Export | ✗ | ✓ Built-in | ✗ |
| Auto-upgrade | ✗ | ✓ Built-in | ✗ |

## TUI Specifics

| Feature | nano-opencode | opencode | oh-my-opencode |
|---------|---------------|----------|----------------|
| Framework | Raw ANSI | Bubble Tea | Depends on opencode |
| Spinner | ✓ Braille | ✓ Advanced | ✓ Inherited |
| Syntax HL | ✗ | ✓ Built-in | ✓ Inherited |
| Markdown | ✗ | ✓ Glamour | ✓ Inherited |
| History | ✓ Last 20 | ✓ Full | ✓ Inherited |
| Resize | ✓ | ✓ | ✓ |
| Mouse | ✗ | ✓ | ✓ |
| Streaming | ✗ | ✓ | ✓ |

## API Response (Z.AI GLM proxy)

| Tool | First Response | Notes |
|------|----------------|-------|
| nano-opencode | ~1800ms | Direct Anthropic SDK |
| opencode | N/A | Needs config setup |
| oh-my-opencode | N/A | Wrapper for opencode |

## Verdict

### nano-opencode TUI
- ✓ Minimal (~320 LOC) - easy to understand and modify
- ✓ No TUI library dependencies - just raw ANSI codes
- ✓ Works with Z.AI GLM out of the box
- ✓ Fast enough for basic chat interactions
- ✗ Missing advanced features (streaming, syntax highlighting, markdown)

### opencode
- ✓ Full-featured production tool
- ✓ Beautiful TUI with Bubble Tea
- ✓ Web UI, ACP server, GitHub integration
- ✗ Large binary (139 MB)
- ✗ More complex setup

### oh-my-opencode
- ✓ Enhances opencode with multi-model orchestration
- ✓ LSP tools and plugin system
- ✗ Requires opencode as dependency
- ✗ Still in beta

## Recommendation

- **For learning/hacking**: Use nano-opencode - minimal code, easy to modify
- **For production**: Use opencode - full-featured, stable
- **For multi-model workflows**: Use oh-my-opencode - orchestration features
