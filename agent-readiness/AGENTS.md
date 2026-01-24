# AGENTS.md - AI Agent Instructions

This file provides instructions for AI agents working with this codebase.

## Project Overview

agent-ready is a CLI tool that scans repositories for AI agent readiness, evaluating maturity across 10 pillars with 5 levels (L1-L5) using the Factory Agent Readiness model.

## Getting Started

### Prerequisites

- Node.js >= 18
- npm/yarn/pnpm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Building

```bash
npm run build
```

## Codebase Structure

```text
src/
├── index.ts          # CLI entry point
├── checks/           # Check implementations (file_exists, github_workflow, etc.)
├── engine/           # Core scanning engine
├── output/           # Output formatters (JSON, Markdown)
└── utils/            # Shared utilities (regex, file cache, path validation)
```

## Key Conventions

### Code Style

- [List your code style conventions]
- Use TypeScript strict mode
- Follow existing patterns in the codebase

### Naming Conventions

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### Testing

- Tests live alongside source files as `*.test.ts`
- Use descriptive test names
- Aim for good coverage of business logic

## Common Tasks

### Adding a New Feature

1. [Step-by-step instructions]

### Fixing a Bug

1. Write a failing test first
2. Fix the bug
3. Verify the test passes

## Do's and Don'ts

### Do

- Follow existing patterns
- Write tests for new code
- Keep commits focused and atomic
- Update documentation as needed

### Don't

- Modify generated files directly
- Skip type checking
- Commit with failing tests
- Add dependencies without justification
