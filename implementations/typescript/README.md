# nano-opencode TypeScript (85-210 LOC)

Two implementations: minimal (no deps) and full (with SDK).

## Minimal Version (85 LOC)

Zero SDK dependencies, uses raw `fetch`:

```bash
# With Bun
ANTHROPIC_API_KEY=sk-... bun nano-minimal.ts "list files"

# With Node.js 18+ (using tsx)
ANTHROPIC_API_KEY=sk-... npx tsx nano-minimal.ts "list files"

# With Deno
ANTHROPIC_API_KEY=sk-... deno run --allow-all nano-minimal.ts "list files"
```

## Full Version (210 LOC)

Uses Anthropic SDK, has interactive REPL:

```bash
# Install dependencies
bun install @anthropic-ai/sdk glob
# or: npm install @anthropic-ai/sdk glob

# Single prompt
ANTHROPIC_API_KEY=sk-... bun nano.ts "explain this code"

# Interactive mode
ANTHROPIC_API_KEY=sk-... bun nano.ts
# Then type prompts, /quit to exit
```

## Comparison

| Feature | nano-minimal.ts | nano.ts |
|---------|-----------------|---------|
| LOC | 85 | 210 |
| Dependencies | None | @anthropic-ai/sdk, glob |
| Tools | 5 | 7 |
| Interactive REPL | No | Yes |
| Streaming | No | Via SDK |
| Best for | Embedding, WASM | Full CLI experience |

## Why TypeScript?

- Largest developer community
- Great async/await support
- Easy to understand and modify
- Runs on Node, Bun, Deno, browsers (WASM)

## Extending

### Adding tools to minimal version:
```typescript
// In TOOLS array:
{ name: 'grep', description: 'Search files', input_schema: {...} },

// In run() function:
if (name === 'grep') {
  return execFileSync('grep', ['-rn', i.pattern, i.path || '.'],
    { encoding: 'utf-8' }).slice(0, 10000);
}
```

### Adding tools to full version:
Same pattern, but tools array uses Anthropic.Tool type.
