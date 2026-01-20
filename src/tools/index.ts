import type { Tool } from '../types.js';
import { getErrorMessage } from '../constants.js';

// Re-export all tools for direct access
export { readFileTool } from './read.js';
export { writeFileTool } from './writefile.js';
export { editFileTool } from './edit.js';
export { bashTool } from './bash.js';
export { globTool } from './glob.js';
export { grepTool } from './grep.js';
export { listDirTool } from './list.js';
export { todoWriteTool, todoReadTool } from './todo.js';
export { webfetchTool } from './webfetch.js';
export { patchTool } from './patch.js';
export { backgroundTaskTool, backgroundOutputTool, backgroundCancelTool, backgroundListTool } from './background.js';
export { sessionListTool, sessionReadTool, sessionSearchTool } from './session.js';
export { skillListTool, skillExecuteTool, skillReadTool } from './skill.js';
export { lspDefinitionTool, lspReferencesTool, lspHoverTool } from './lsp.js';
export { diffTool } from './diff.js';

// Import for internal use
import { readFileTool } from './read.js';
import { writeFileTool } from './writefile.js';
import { editFileTool } from './edit.js';
import { bashTool } from './bash.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list.js';
import { todoWriteTool, todoReadTool } from './todo.js';
import { webfetchTool } from './webfetch.js';
import { patchTool } from './patch.js';
import { backgroundTaskTool, backgroundOutputTool, backgroundCancelTool, backgroundListTool } from './background.js';
import { sessionListTool, sessionReadTool, sessionSearchTool } from './session.js';
import { skillListTool, skillExecuteTool, skillReadTool } from './skill.js';
import { lspDefinitionTool, lspReferencesTool, lspHoverTool } from './lsp.js';
import { diffTool } from './diff.js';

const staticTools: Tool[] = [
  readFileTool, writeFileTool, editFileTool,
  bashTool,
  globTool, grepTool, listDirTool,
  todoWriteTool, todoReadTool,
  webfetchTool, patchTool,
  backgroundTaskTool, backgroundOutputTool, backgroundCancelTool, backgroundListTool,
  sessionListTool, sessionReadTool, sessionSearchTool,
  skillListTool, skillExecuteTool, skillReadTool,
  lspDefinitionTool, lspReferencesTool, lspHoverTool,
  diffTool,
];

let dynamicTools: Tool[] = [];

export const allTools: Tool[] = staticTools;

export function getAllTools(): Tool[] {
  return [...staticTools, ...dynamicTools];
}

export function setDynamicTools(tools: Tool[]): void {
  dynamicTools = tools;
}

export function addDynamicTool(tool: Tool): void {
  dynamicTools.push(tool);
}

export function clearDynamicTools(): void {
  dynamicTools = [];
}

export function getToolByName(name: string): Tool | undefined {
  return getAllTools().find((t) => t.name === name);
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = getToolByName(name);
  if (!tool) return `Error: Unknown tool "${name}"`;

  try {
    return await tool.execute(args);
  } catch (error) {
    return `Error executing ${name}: ${getErrorMessage(error)}`;
  }
}
