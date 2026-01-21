# nano-opencode Zig

Minimal AI coding agent in Zig (~92 LOC).

## Requirements

- Zig 0.13+ (https://ziglang.org/download/)
- curl (for HTTPS)

## Build

```bash
# Debug build
zig build

# Release build (optimized)
zig build -Doptimize=ReleaseFast
```

## Run

```bash
ANTHROPIC_API_KEY=sk-... ./zig-out/bin/nano "read package.json"

# Via zig build
ANTHROPIC_API_KEY=sk-... zig build run -- "your prompt"
```

## Features

- 3 tools: read_file, bash, list_dir
- Uses curl for HTTPS (native TLS is complex)
- ~2.2MB binary size
- Cross-compilation to any target

## Performance

- Startup: ~1ms
- Memory: ~2MB
