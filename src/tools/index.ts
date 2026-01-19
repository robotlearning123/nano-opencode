import type { Tool } from '../types.js';
import { readFileTool } from './read.js';
import { writeFileTool } from './writefile.js';
import { editFileTool } from './edit.js';
import { bashTool } from './bash.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list.js';

export const allTools: Tool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  bashTool,
  globTool,
  grepTool,
  listDirTool,
];

export function getToolByName(name: string): Tool | undefined {
  return allTools.find((t) => t.name === name);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const tool = getToolByName(name);
  if (!tool) {
    return `Error: Unknown tool "${name}"`;
  }

  try {
    return await tool.execute(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error executing ${name}: ${message}`;
  }
}
