# nano-opencode C

Minimal AI coding agent in C (~200 LOC).

**Smallest binary at 17KB!** (uses curl for HTTPS)

## Build

```bash
make
# or directly:
gcc -O2 -Wall -o nano nano.c
```

## Run

```bash
ANTHROPIC_API_KEY=sk-... ./nano "read package.json"

# With proxy
ANTHROPIC_API_KEY=key ANTHROPIC_BASE_URL=https://proxy.example.com ./nano "hello"
```

## Features

- 4 tools: read_file, write_file, bash, list_dir
- Custom base URL support
- Zero library dependencies (uses curl command for HTTPS)
- 17KB binary size
- POSIX compatible

## Requirements

- GCC or Clang
- curl (installed on most systems)
