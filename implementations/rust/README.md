# nano-opencode Rust

Minimal AI coding agent in Rust (~118 LOC).

## Build

```bash
# Standard build
cargo build --release

# If you have a non-standard cc wrapper, specify the real gcc:
CC=/usr/bin/gcc cargo build --release
```

## Run

```bash
# Direct API
ANTHROPIC_API_KEY=sk-... ./target/release/nano-opencode "read package.json"

# With proxy
ANTHROPIC_API_KEY=key ANTHROPIC_BASE_URL=https://api.z.ai ./target/release/nano-opencode "hello"

# Or via cargo
ANTHROPIC_API_KEY=sk-... cargo run -- "your prompt"
```

## Features

- 5 tools: read_file, write_file, edit_file, bash, list_dir
- Custom base URL support (proxy/self-hosted)
- ~2MB binary size
- Zero runtime dependencies (statically linked)
