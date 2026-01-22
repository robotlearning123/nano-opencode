/**
 * LSP Types - minimal set for core functionality
 */

export interface Position {
  line: number; // 0-based
  character: number; // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface Diagnostic {
  range: Range;
  severity?: 1 | 2 | 3 | 4; // Error, Warning, Info, Hint
  message: string;
  source?: string;
}

export interface Hover {
  contents: string | { kind: string; value: string };
  range?: Range;
}

export interface LanguageServerConfig {
  command: string;
  args?: string[];
  filetypes: string[]; // e.g., ['typescript', 'javascript']
  rootPatterns?: string[]; // e.g., ['package.json', 'tsconfig.json']
}

// Default language server configurations
export const DEFAULT_SERVERS: Record<string, LanguageServerConfig> = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    filetypes: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    rootPatterns: ['package.json', 'tsconfig.json', 'jsconfig.json'],
  },
  python: {
    command: 'pylsp',
    args: [],
    filetypes: ['python'],
    rootPatterns: ['pyproject.toml', 'setup.py', 'requirements.txt'],
  },
  go: {
    command: 'gopls',
    args: [],
    filetypes: ['go'],
    rootPatterns: ['go.mod', 'go.sum'],
  },
  rust: {
    command: 'rust-analyzer',
    args: [],
    filetypes: ['rust'],
    rootPatterns: ['Cargo.toml'],
  },
};

// File extension to language mapping
export const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
};
