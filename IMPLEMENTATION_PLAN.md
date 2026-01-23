# nano-opencode Implementation Plan

> Closing the gap with top coding agents while staying "simple but powerful"

## Current Status

nano-opencode already has:
- ✅ Multi-provider support (Anthropic, OpenAI, OpenRouter, Gemini)
- ✅ Streaming output
- ✅ 13 core tools (read, write, edit, bash, glob, grep, etc.)
- ✅ MCP integration
- ✅ Session persistence
- ✅ Hooks system (safety, logging, timing, truncation)
- ✅ Agent architecture (Sisyphus default)
- ✅ Parallel tool execution (read-only batching)
- ✅ Todo enforcement loop
- ✅ Context compaction (TUI mode)
- ✅ Markdown rendering with syntax highlighting

## Gap Analysis vs Top Agents

| Feature | Claude Code | Codex CLI | nano-opencode |
|---------|-------------|-----------|---------------|
| Plan Mode | ✅ | ❌ | ✅ Done |
| Web Search | ✅ | ❌ | ✅ Done |
| Image Support | ✅ | ✅ | ✅ Done |
| Sandbox | ✅ | ✅ | ✅ Done |
| Local Models | ❌ | ✅ | ✅ Ollama |
| Git Auto-commit | ✅ | ✅ | ✅ Done |
| Sub-agents | ✅ | ❌ | ✅ Done |

---

## Phase 1: Core Features

### 1.1 Plan Mode

**Goal:** Let users review and approve implementation plans before execution.

**Files to create/modify:**
- `src/agents/plan.ts` - Plan agent definition
- `src/tools/plan.ts` - Plan-related tools
- `src/cli.ts` - Handle `/plan` command

**Implementation:**

```typescript
// src/agents/plan.ts
export const planAgent: AgentDefinition = {
  name: 'plan',
  description: 'Planning mode - proposes changes without executing',
  systemPrompt: `You are in PLAN MODE.
Your job is to analyze the request and create a detailed implementation plan.
DO NOT execute any file modifications. Only propose changes.
Format your plan as:
1. Files to modify/create
2. Key changes in each file
3. Potential risks or considerations
4. Estimated complexity (low/medium/high)`,
  tools: ['glob', 'grep', 'read_file', 'list_dir', 'todo_write'],
  maxTurns: 10,
};
```

**User flow:**
```
> /plan Add authentication to the API
◆ Plan Mode activated
  Analyzing codebase...

  📋 Implementation Plan:
  1. Create src/auth/middleware.ts
  2. Modify src/routes/index.ts
  3. Add JWT dependency to package.json

  Approve? [y/n/edit]
> y
◆ Executing plan...
```

### 1.2 Web Search Tool

**Goal:** Enable real-time information retrieval.

**Files to create:**
- `src/tools/websearch.ts`

**Implementation:**

```typescript
// src/tools/websearch.ts
import type { Tool } from '../types.js';

export const webSearchTool: Tool = {
  name: 'web_search',
  description: 'Search the web for current information',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', default: 5 },
    },
    required: ['query'],
  },
  execute: async (args) => {
    const { query, maxResults = 5 } = args as { query: string; maxResults?: number };

    // Use DuckDuckGo HTML API (no API key needed)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'nano-opencode/1.0' }
    });

    const html = await response.text();
    // Parse results from HTML (simple regex extraction)
    const results = parseSearchResults(html, maxResults);

    return JSON.stringify(results, null, 2);
  },
};

function parseSearchResults(html: string, max: number): SearchResult[] {
  // Extract title, URL, snippet from DuckDuckGo HTML response
  const results: SearchResult[] = [];
  const regex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
  let match;
  while ((match = regex.exec(html)) && results.length < max) {
    results.push({ url: match[1], title: match[2] });
  }
  return results;
}
```

### 1.3 Image Support

**Goal:** Allow image inputs for visual context.

**Files to modify:**
- `src/types.ts` - Add image content type
- `src/providers/*.ts` - Handle image messages
- `src/tools/screenshot.ts` - New tool

**Implementation:**

```typescript
// src/types.ts additions
export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    data?: string;  // base64
    url?: string;
  };
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | (TextContent | ImageContent)[];
  // ... existing fields
}
```

```typescript
// src/tools/screenshot.ts
import { spawn } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export const screenshotTool: Tool = {
  name: 'screenshot',
  description: 'Take a screenshot of the screen or a window',
  parameters: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['full', 'window', 'selection'] },
    },
  },
  execute: async (args) => {
    const { region = 'full' } = args as { region?: string };
    const tmpFile = join(tmpdir(), `screenshot-${Date.now()}.png`);

    // Use platform-specific screenshot tool
    const cmd = process.platform === 'darwin'
      ? ['screencapture', '-x', tmpFile]
      : ['scrot', tmpFile];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(cmd[0], cmd.slice(1));
      proc.on('close', (code) => code === 0 ? resolve() : reject());
    });

    const base64 = readFileSync(tmpFile, 'base64');
    unlinkSync(tmpFile);

    return JSON.stringify({
      type: 'image',
      media_type: 'image/png',
      data: base64,
    });
  },
};
```

---

## Phase 2: Safety & Local Models

### 2.1 Enhanced Sandbox

**Goal:** Safe command execution with resource limits.

**Files to create:**
- `src/sandbox/index.ts`
- `src/sandbox/docker.ts`
- `src/sandbox/firejail.ts`

**Implementation:**

```typescript
// src/sandbox/index.ts
export interface SandboxOptions {
  timeout?: number;      // ms
  maxMemory?: string;    // e.g., '512m'
  network?: boolean;     // allow network access
  readOnly?: string[];   // read-only paths
  writeable?: string[];  // writeable paths
}

export async function runInSandbox(
  command: string,
  options: SandboxOptions = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { timeout = 30000, maxMemory = '512m', network = false } = options;

  // Try Docker first, fallback to firejail, then direct
  if (await hasDocker()) {
    return runInDocker(command, options);
  } else if (await hasFirejail()) {
    return runInFirejail(command, options);
  } else {
    console.warn('[sandbox] No sandbox available, running directly');
    return runDirect(command, { timeout });
  }
}
```

### 2.2 Ollama Integration

**Goal:** Native local model support.

**Files to create:**
- `src/providers/ollama.ts`

**Implementation:**

```typescript
// src/providers/ollama.ts
import type { LLMProvider, Message, Tool, StreamChunk } from '../types.js';

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(model: string = 'llama3.2', baseUrl: string = 'http://localhost:11434') {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async chat(
    messages: Message[],
    tools: Tool[],
    onChunk?: (chunk: StreamChunk) => void,
    systemPrompt?: string
  ): Promise<Message> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: this.formatMessages(messages, systemPrompt),
        tools: tools.map(this.formatTool),
        stream: !!onChunk,
      }),
    });

    if (onChunk) {
      return this.handleStream(response, onChunk);
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  private formatTool(tool: Tool) {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }
}
```

### 2.3 Git Auto-commit Tool

**Goal:** Streamlined version control.

**Files to create:**
- `src/tools/git.ts`

**Implementation:**

```typescript
// src/tools/git.ts
export const gitCommitTool: Tool = {
  name: 'git_commit',
  description: 'Stage and commit changes with a generated message',
  parameters: {
    type: 'object',
    properties: {
      files: { type: 'array', items: { type: 'string' }, description: 'Files to stage (default: all modified)' },
      message: { type: 'string', description: 'Commit message (auto-generated if not provided)' },
    },
  },
  execute: async (args) => {
    const { files, message } = args as { files?: string[]; message?: string };

    // Stage files
    const stageCmd = files?.length
      ? ['git', 'add', ...files]
      : ['git', 'add', '-A'];

    await runCommand(stageCmd);

    // Get diff for message generation
    const diff = await runCommand(['git', 'diff', '--cached', '--stat']);

    // Use provided message or generate one
    const commitMsg = message || await generateCommitMessage(diff);

    // Commit
    const result = await runCommand(['git', 'commit', '-m', commitMsg]);

    return `Committed: ${commitMsg}\n\n${result}`;
  },
};

async function generateCommitMessage(diff: string): Promise<string> {
  // Simple heuristic-based message generation
  const lines = diff.split('\n');
  const stats = lines[lines.length - 2] || '';

  if (stats.includes('insertions') && !stats.includes('deletions')) {
    return 'Add new functionality';
  } else if (stats.includes('deletions') && !stats.includes('insertions')) {
    return 'Remove unused code';
  } else {
    return 'Update implementation';
  }
}
```

---

## Phase 3: Advanced Features

### 3.1 Sub-agents System

**Goal:** Spawn specialized agents for complex tasks.

**Files to create:**
- `src/agents/subagent.ts`
- `src/tools/spawn.ts`

**Implementation:**

```typescript
// src/tools/spawn.ts
export const spawnAgentTool: Tool = {
  name: 'spawn_agent',
  description: 'Spawn a specialized sub-agent for a specific task',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['research', 'code-review', 'test-writer', 'refactor'],
        description: 'Type of sub-agent to spawn'
      },
      task: { type: 'string', description: 'Task for the sub-agent' },
      context: { type: 'array', items: { type: 'string' }, description: 'Relevant file paths' },
    },
    required: ['type', 'task'],
  },
  execute: async (args) => {
    const { type, task, context = [] } = args as SubAgentArgs;

    // Create sub-agent with limited scope
    const subAgent = createSubAgent(type, {
      maxTurns: 10,
      tools: getSubAgentTools(type),
      context,
    });

    // Run sub-agent task
    const result = await subAgent.run(task);

    return `[${type} agent]\n${result}`;
  },
};

const SUB_AGENT_TOOLS: Record<string, string[]> = {
  'research': ['glob', 'grep', 'read_file', 'web_search'],
  'code-review': ['glob', 'grep', 'read_file', 'diff'],
  'test-writer': ['glob', 'grep', 'read_file', 'write_file'],
  'refactor': ['glob', 'grep', 'read_file', 'edit_file'],
};
```

### 3.2 VS Code Extension

**Goal:** IDE integration for broader adoption.

**Structure:**
```
nano-opencode-vscode/
├── package.json
├── src/
│   ├── extension.ts
│   ├── sidebarProvider.ts
│   └── commands.ts
└── webview/
    └── chat.html
```

**Key features:**
- Sidebar chat panel
- File context injection
- Selection-based prompts
- Inline diff preview

---

## Implementation Priority

| Priority | Feature | Effort | Impact | Status |
|----------|---------|--------|--------|--------|
| P0 | Plan Mode | Medium | High | ✅ Done |
| P0 | Web Search | Low | High | ✅ Done |
| P1 | Image Support | Medium | Medium | ✅ Done |
| P1 | Ollama | Low | High | ✅ Done |
| P2 | Enhanced Sandbox | High | Medium | ✅ Done |
| P2 | Git Auto-commit | Low | Medium | ✅ Done |
| P3 | Sub-agents | High | High | ✅ Done |
| P3 | VS Code Extension | High | High | 📋 Planned |

---

## Philosophy Reminders

1. **Simple > Complex** - Every feature should add value without bloat
2. **~1000 LOC target** - If we exceed this significantly, reconsider
3. **No framework dependencies** - Keep the dependency tree minimal
4. **Composable tools** - Tools should work together naturally
5. **User control** - Always allow manual override of automated features

---

## Success Metrics

- [ ] Plan mode reduces incorrect implementations by 50%
- [ ] Web search enables real-time documentation lookups
- [ ] Image support unlocks UI/screenshot debugging
- [ ] Ollama enables offline/private usage
- [ ] Sub-agents handle complex tasks autonomously
- [ ] Total codebase stays under 2000 LOC
