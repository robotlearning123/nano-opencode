import type { Tool } from '../types.js';
import {
  EXCLUDED_RG_PATTERNS,
  EXCLUDED_GREP_DIRS,
  DEFAULT_GREP_MAX_RESULTS,
} from '../constants.js';
import { runSpawn } from './helpers.js';

const COMMON_FILE_TYPES = [
  '*.ts',
  '*.js',
  '*.tsx',
  '*.jsx',
  '*.json',
  '*.md',
  '*.txt',
  '*.py',
  '*.go',
  '*.rs',
  '*.java',
  '*.c',
  '*.cpp',
  '*.h',
  '*.css',
  '*.html',
  '*.yaml',
  '*.yml',
  '*.toml',
  '*.xml',
];

function formatGrepResult(stdout: string, maxResults?: number): string {
  if (!stdout.trim()) return 'No matches found.';
  const lines = stdout.trim().split('\n');
  const limited = maxResults ? lines.slice(0, maxResults) : lines;
  return `Found ${limited.length} match(es):\n${limited.join('\n')}`;
}

export const grepTool: Tool = {
  name: 'grep',
  description:
    'Search for a pattern in files using ripgrep (rg) or grep. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'The regex pattern to search for' },
      path: {
        type: 'string',
        description: 'The directory or file to search in. Default is current directory.',
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts", "*.{js,jsx}")',
      },
      case_insensitive: {
        type: 'boolean',
        description: 'Make the search case-insensitive. Default is false.',
      },
      max_results: {
        type: 'number',
        description: `Maximum number of results to return. Default is ${DEFAULT_GREP_MAX_RESULTS}.`,
      },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || '.';
    const globPattern = args.glob as string | undefined;
    const caseInsensitive = (args.case_insensitive as boolean) ?? false;
    const maxResults = (args.max_results as number) ?? DEFAULT_GREP_MAX_RESULTS;

    // Build ripgrep args
    const rgArgs = [
      '--line-number',
      '--no-heading',
      '--color=never',
      '--no-ignore',
      '-m',
      String(maxResults),
      ...(caseInsensitive ? ['-i'] : []),
      '--glob',
      globPattern || '*',
      ...EXCLUDED_RG_PATTERNS.flatMap((ex) => ['--glob', ex]),
      pattern,
      searchPath,
    ];

    const rgResult = await runSpawn({ command: 'rg', args: rgArgs, timeout: 30000 });

    // ripgrep succeeded or found no matches (code 1)
    if (rgResult.exitCode === 0 || rgResult.exitCode === 1) {
      return formatGrepResult(rgResult.stdout);
    }

    // Fallback to grep
    const grepArgs = [
      '-r',
      '-n',
      ...(globPattern
        ? [`--include=${globPattern}`]
        : COMMON_FILE_TYPES.map((t) => `--include=${t}`)),
      ...EXCLUDED_GREP_DIRS,
      ...(caseInsensitive ? ['-i'] : []),
      pattern,
      searchPath,
    ];

    const grepResult = await runSpawn({ command: 'grep', args: grepArgs, timeout: 30000 });
    return grepResult.exitCode === -1
      ? `Error: ${grepResult.stderr}`
      : formatGrepResult(grepResult.stdout, maxResults);
  },
};
