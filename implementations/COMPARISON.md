# Multi-Language Implementation Comparison

## Summary

All implementations share the same core:
1. **5 tools**: read_file, write_file, edit_file, bash, list_dir
2. **Agent loop**: Send message → Execute tool calls → Repeat until done
3. **Proxy support**: ANTHROPIC_BASE_URL for custom endpoints

## Line Count Comparison

| Implementation | LOC | Language | Dependencies |
|----------------|-----|----------|--------------|
| **nano.py** | 72 | Python | Zero (stdlib) |
| **nano.go** | 85 | Go | Zero (stdlib) |
| **nano-minimal.ts** | 86 | TypeScript | Zero (fetch) |
| **nano.rs** | 118 | Rust | 3 crates |
| **nano.ts** | 216 | TypeScript | SDK + glob |

## Feature Comparison

| Feature | Python | TS Minimal | TS Full | Rust | Go |
|---------|--------|------------|---------|------|-----|
| Tools | 5 | 5 | 7 | 5 | 5 |
| Interactive REPL | ❌ | ❌ | ✅ | ❌ | ❌ |
| Streaming | ❌ | ❌ | ✅ | ❌ | ❌ |
| Custom base URL | ✅ | ✅ | ✅ | ✅ | ✅ |
| Zero dependencies | ✅ | ✅ | ❌ | ❌ | ✅ |
| Single file | ✅ | ✅ | ✅ | ✅ | ✅ |

## Performance (Estimated)

| Metric | Python | TS Minimal | TS Full | Rust | Go |
|--------|--------|------------|---------|------|-----|
| Startup | ~50ms | ~30ms | ~80ms | ~5ms | ~10ms |
| Memory | ~30MB | ~50MB | ~80MB | ~5MB | ~10MB |
| Binary size | N/A | N/A | N/A | ~2MB | ~5MB |
| Compile time | N/A | N/A | N/A | ~30s | ~2s |

## Platform Support

| Platform | Python | TS | Rust | Go |
|----------|--------|-----|------|-----|
| Linux x64 | ✅ | ✅ | ✅ | ✅ |
| macOS ARM | ✅ | ✅ | ✅ | ✅ |
| Windows | ✅ | ✅ | ✅ | ✅ |
| Raspberry Pi | ✅ | ✅ | ✅ | ✅ |
| ESP32/MCU | ❌ | ❌ | ⚠️ | ❌ |
| WASM | ⚠️ | ✅ | ✅ | ✅ |
| Docker | ✅ | ✅ | ✅ | ✅ |

⚠️ = Possible with modifications

## Code Structure Comparison

### Python (72 LOC)
```python
# Config: 4 lines
# Tools JSON: 5 lines
# Tool execution: 17 lines
# API call: 5 lines
# Agent loop: 15 lines
# Main: 6 lines
```

### Go (85 LOC)
```go
// Config/imports: 16 lines
// Tools JSON: 6 lines
// Types: 4 lines
// Tool execution: 14 lines
// API call: 10 lines
// Agent loop: 12 lines
// Main: 8 lines
```

### TypeScript Minimal (86 LOC)
```typescript
// Config: 5 lines
// Tools array: 6 lines
// Tool execution: 15 lines
// Types: 2 lines
// API call: 10 lines
// Agent loop: 18 lines
// Main: 4 lines
```

### Rust (118 LOC)
```rust
// Config/tools: 15 lines
// Types: 8 lines
// Tool execution: 30 lines
// API call: 15 lines
// Agent loop: 20 lines
// Main: 15 lines
```

## Best Use Cases

| Language | Best For |
|----------|----------|
| **Python** | Pi, data science, ML, quick scripts |
| **Go** | Cloud, K8s, single binary deploy, servers |
| **TypeScript** | Web dev, VS Code, Bun ecosystem |
| **Rust** | Embedded, WASM, high-performance, no GC |

## Tested ✅

| Implementation | API Test | Tool Test |
|----------------|----------|-----------|
| Python | ✅ | ✅ read_file |
| TypeScript Minimal | ✅ | ✅ read_file |
| TypeScript Full | ✅ | ✅ read_file |
| Go | ✅ | ✅ read_file |
| Rust | ⚠️ | ⚠️ (toolchain issue) |

## Usage Examples

```bash
# Python
ANTHROPIC_API_KEY=sk-... python nano.py "read config.json"

# TypeScript (Bun)
ANTHROPIC_API_KEY=sk-... bun nano-minimal.ts "list files"

# Go
ANTHROPIC_API_KEY=sk-... go run nano.go "edit file.txt"

# Rust
ANTHROPIC_API_KEY=sk-... cargo run -- "run tests"

# With proxy (all languages)
ANTHROPIC_BASE_URL=https://proxy.example.com/v1 \
ANTHROPIC_API_KEY=your-key \
python nano.py "hello"
```

## Conclusion

The core agent loop is **remarkably consistent** across languages:

1. All implementations are **<120 LOC** (except TS Full with extras)
2. All support **custom proxy URLs**
3. All implement the **same 5 tools**
4. All follow the **same agent loop pattern**

This proves that AI coding agents don't need to be complex. The essential functionality fits in ~100 lines of any language.
