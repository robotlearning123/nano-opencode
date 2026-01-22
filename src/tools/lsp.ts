/**
 * LSP Tools - go to definition, find references, hover info
 */

import { resolve } from 'path';
import type { Tool, ToolParameters } from '../types.js';
import { lspManager } from '../lsp/index.js';
import { parsePosition } from './helpers.js';

type Location = { uri: string; range: { start: { line: number; character: number } } };

function formatLocation(loc: Location): string {
  const path = loc.uri.replace('file://', '');
  return `${path}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
}

const LSP_PARAMS: ToolParameters = {
  type: 'object',
  properties: {
    file: { type: 'string', description: 'Path to the file' },
    line: { type: 'string', description: 'Line number (1-based)' },
    column: { type: 'string', description: 'Column number (1-based)' },
  },
  required: ['file', 'line', 'column'],
};

type LspArgs = { file: string; line: string; column: string };

type LspClient = NonNullable<ReturnType<typeof lspManager.getClient>>;

async function withLspClient<T>(
  args: Record<string, unknown>,
  operation: (client: LspClient, file: string, line: number, col: number) => Promise<T>
): Promise<T | string> {
  const { file: filePath, line, column } = args as unknown as LspArgs;
  const file = resolve(filePath);
  const pos = parsePosition(line, column);

  const client = lspManager.getClient(file);
  if (!client) return `No language server available for ${file}`;

  try {
    return await operation(client, file, pos.line, pos.column);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const lspDefinitionTool: Tool = {
  name: 'lsp_definition',
  description:
    'Find the definition of a symbol at a specific location. Requires a language server.',
  parameters: LSP_PARAMS,
  execute: (args) =>
    withLspClient(args, async (client, file, line, col) => {
      const locations = await client.getDefinition(file, line, col);
      return locations.length === 0
        ? 'No definition found'
        : locations.map(formatLocation).join('\n');
    }),
};

export const lspReferencesTool: Tool = {
  name: 'lsp_references',
  description: 'Find all references to a symbol at a specific location.',
  parameters: LSP_PARAMS,
  execute: (args) =>
    withLspClient(args, async (client, file, line, col) => {
      const locations = await client.getReferences(file, line, col);
      return locations.length === 0
        ? 'No references found'
        : `Found ${locations.length} references:\n${locations.map(formatLocation).join('\n')}`;
    }),
};

export const lspHoverTool: Tool = {
  name: 'lsp_hover',
  description: 'Get type information and documentation for a symbol at a specific location.',
  parameters: LSP_PARAMS,
  execute: (args) =>
    withLspClient(args, async (client, file, line, col) => {
      const hover = await client.getHover(file, line, col);
      return hover || 'No hover information available';
    }),
};
