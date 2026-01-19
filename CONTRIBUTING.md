# Contributing to nano-opencode

Thank you for your interest in contributing to nano-opencode! This guide will help you get started.

## Development Setup

1. Fork and clone the repository:
```bash
git clone https://github.com/yourusername/nano-opencode.git
cd nano-opencode
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your API keys
```

4. Run in development mode:
```bash
npm run dev
```

## Project Structure

```
src/
├── app.ts              # Entry point
├── cli.ts              # CLI interface
├── config.ts           # Configuration
├── store.ts            # Session storage
├── types.ts            # Type definitions
├── providers/          # LLM providers
└── tools/              # Tool implementations
```

## Making Changes

1. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and ensure tests pass:
```bash
npm test
```

3. Type check your code:
```bash
npm run typecheck
```

4. Commit your changes:
```bash
git add .
git commit -m "feat: add your feature description"
```

## Commit Message Format

We follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test additions or changes
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

## Adding a New Tool

1. Create a new file in `src/tools/`:
```typescript
import type { Tool } from '../types.js';

export const myTool: Tool = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      // Define parameters
    },
    required: ['required_param'],
  },
  execute: async (args) => {
    // Implementation
    return 'Result string';
  },
};
```

2. Register it in `src/tools/index.ts`:
```typescript
import { myTool } from './mytool.js';

export const allTools: Tool[] = [
  // ... existing tools
  myTool,
];
```

3. Add tests in `test/tools.test.ts`

## Adding a New Provider

1. Create a new file in `src/providers/`:
```typescript
import type { LLMProvider, Message, Tool, StreamChunk } from '../types.js';

export class MyProvider implements LLMProvider {
  name = 'myprovider';

  constructor(apiKey: string, model: string, maxTokens: number) {
    // Initialize
  }

  async chat(
    messages: Message[],
    tools: Tool[],
    onChunk: (chunk: StreamChunk) => void
  ): Promise<Message> {
    // Implementation
  }
}
```

2. Register it in `src/providers/index.ts`

## Testing

- Write tests for all new functionality
- Ensure all tests pass before submitting
- Maintain or improve code coverage

## Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

## Pull Request Process

1. Update README.md if needed
2. Update tests
3. Ensure all tests pass
4. Update CHANGELOG.md (if exists)
5. Create a pull request with a clear description

## Questions?

Open an issue for discussion before starting major changes.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
