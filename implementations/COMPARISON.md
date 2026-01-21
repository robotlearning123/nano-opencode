# Multi-Language Implementation Comparison

## Quick Links

| Version | Description | LOC |
|---------|-------------|-----|
| **Minimal** | Basic agent (~5 tools) | 72-200 LOC |
| **SWE-bench** | Extended agent (15 tools) | 250-350 LOC |
| **Benchmark** | Performance testing tool | 300 LOC |

## Summary

All implementations share the same core:
1. **Tools**: read_file, write_file, edit_file, bash, list_dir (varies by impl)
2. **Agent loop**: Send message → Execute tool calls → Repeat until done
3. **Model**: `claude-sonnet-4-20250514` (configurable via MODEL env)
4. **Proxy support**: ANTHROPIC_BASE_URL for custom endpoints

## Line Count Comparison

| Implementation | LOC | Language | Dependencies |
|----------------|-----|----------|--------------|
| **nano.py** | 72 | Python | Zero (stdlib) |
| **nano.go** | 85 | Go | Zero (stdlib) |
| **nano-minimal.ts** | 86 | TypeScript | Zero (fetch) |
| **nano.zig** | 92 | Zig | Zero (stdlib + curl) |
| **nano.rs** | 118 | Rust | 3 crates |
| **nano.c** | 200 | C | Zero (stdlib + curl) |

## Binary Size Comparison

| Language | Binary Size | Notes |
|----------|-------------|-------|
| **C** | **17 KB** | Smallest! Uses curl for HTTPS |
| Rust | 2.0 MB | Static linking with TLS |
| Zig | 2.2 MB | Static linking |
| Go | 7.9 MB | Includes runtime |

## Startup Performance

Measured as average of 3 runs (time to show usage/error):

| Language | Startup Time | Relative |
|----------|-------------|----------|
| **Rust** | **1 ms** | 1x (baseline) |
| **Zig** | **1 ms** | 1x |
| C | 4 ms | 4x |
| Go | 4 ms | 4x |
| TypeScript | 19 ms | 19x |
| Python | 38 ms | 38x |

## Feature Comparison

| Feature | Python | TS | Go | Rust | Zig | C |
|---------|--------|-----|-----|------|-----|---|
| Tools | 5 | 5 | 5 | 5 | 3 | 4 |
| Custom base URL | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Zero runtime deps | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Single file | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Native TLS | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |

## Platform Support

| Platform | Python | TS | Go | Rust | Zig | C |
|----------|--------|-----|-----|------|-----|---|
| Linux x64 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| macOS ARM | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Windows | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Raspberry Pi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ESP32/MCU | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ⚠️ |
| WASM | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ |

⚠️ = Possible with modifications

## Best Use Cases

| Language | Best For |
|----------|----------|
| **Python** | Data science, ML, quick scripts, Raspberry Pi |
| **TypeScript** | Web dev, VS Code extensions, Bun ecosystem |
| **Go** | Cloud services, K8s, single binary deployment |
| **Rust** | Embedded, WASM, high-performance, memory safety |
| **Zig** | Embedded, C interop, freestanding targets |
| **C** | Minimal size, legacy systems, maximum portability |

## SWE-bench Extended Agents

For real-world software engineering tasks (GitHub issues, debugging, refactoring):

| File | Language | LOC | Tools |
|------|----------|-----|-------|
| `python/nano_swe.py` | Python | ~250 | 15 |
| `typescript/nano-swe.ts` | TypeScript | ~300 | 15 |

### SWE-bench Tools (15 total)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FILE OPERATIONS          │  CODE SEARCH           │  GIT OPERATIONS        │
│  ├─ read_file             │  ├─ grep               │  ├─ git_status         │
│  ├─ write_file            │  ├─ find_files         │  ├─ git_diff           │
│  ├─ edit_file             │  └─ find_definition    │  └─ git_log            │
│  └─ multi_edit            │                        │                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  DIRECTORY                │  SHELL & TESTING       │  PLANNING              │
│  ├─ list_dir              │  ├─ bash               │  └─ think              │
│  └─ tree                  │  └─ run_tests          │                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

- **Atomic multi-file edits** with rollback on failure
- **Intelligent code search** with grep, find, and symbol definition lookup
- **Test framework auto-detection** (pytest, npm test, cargo test, go test)
- **Git integration** for status, diff, and history
- **Think tool** for complex reasoning without action

### Usage

```bash
# Python
python nano_swe.py "fix the bug in issue #123"
python nano_swe.py "add input validation to the login function"
python nano_swe.py "refactor the database module to use connection pooling"

# TypeScript
bun nano-swe.ts "fix the type error in src/utils.ts"
bun nano-swe.ts "add error handling to the API endpoints"
```

## Benchmark Tool

Test API performance with the included benchmark script:

```bash
# Quick benchmark (5 iterations per test)
python benchmark.py

# Full benchmark (20 iterations)
python benchmark.py --full

# Compare endpoints
python benchmark.py --compare

# Test specific endpoint
python benchmark.py --endpoint z.ai
python benchmark.py --endpoint anthropic
```

### Metrics Measured

- **TTFB**: Time to first byte (network + inference start)
- **Total Time**: Complete response time
- **Tokens/sec**: Output throughput
- **Error Rate**: Request failures

## Build Commands

```bash
# Python (no build needed)
python3 python/nano.py "prompt"

# TypeScript (Bun)
bun typescript/nano-minimal.ts "prompt"

# Go
cd go && go build -o nano nano.go
./nano "prompt"

# Rust
cd rust && cargo build --release
./target/release/nano-opencode "prompt"

# Zig
cd zig && zig build -Doptimize=ReleaseFast
./zig-out/bin/nano "prompt"

# C
cd c && make
./nano "prompt"
```

## Environment Variables

All implementations support:
- `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` - API key (required)
- `ANTHROPIC_BASE_URL` - Custom API endpoint (optional)
- `MODEL` - Model name (default: `claude-sonnet-4-20250514`)

## Conclusion

**Key findings:**

1. **Smallest binary**: C at 17KB (uses external curl)
2. **Fastest startup**: Rust/Zig at 1ms
3. **Fewest lines**: Python at 72 LOC
4. **Most portable**: Go (single static binary with TLS)
5. **Best for embedded**: Zig/Rust (memory safety, no GC)

The core agent loop is **remarkably consistent** across all 6 languages - proving that AI coding agents don't need to be complex. The essential functionality fits in ~100 lines of any language.
