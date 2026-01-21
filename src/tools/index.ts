/**
 * Tools Registry
 * Core tools + dynamic tool loading with caching
 */

import type { Tool } from '../types.js';
import { getErrorMessage } from '../constants.js';

// Core tools (11 essential)
import { readFileTool } from './read.js';
import { writeFileTool } from './writefile.js';
import { editFileTool } from './edit.js';
import { bashTool } from './bash.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list.js';
import { patchTool } from './patch.js';
import { diffTool } from './diff.js';
import { todoWriteTool, todoReadTool } from './todo.js';
import { undoTool, listBackupsTool } from './undo.js';

// Core tools array (always available)
const coreTools: Tool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  bashTool,
  globTool,
  grepTool,
  listDirTool,
  patchTool,
  diffTool,
  todoWriteTool,
  todoReadTool,
  undoTool,
  listBackupsTool,
];

// Dynamic tools (from MCP servers, plugins, etc.)
let dynamicTools: Tool[] = [];

// OpenCode plugin tools
let openCodeTools: Tool[] = [];

// Tool cache for performance
let toolCache: Tool[] | null = null;

/**
 * Get all tools (cached)
 */
export function getAllTools(): Tool[] {
  if (!toolCache) {
    toolCache = [...coreTools, ...dynamicTools, ...openCodeTools];
  }
  return toolCache;
}

/**
 * Register OpenCode plugin tools
 */
export function registerOpenCodeTools(tools: Tool[]): void {
  openCodeTools = tools;
  invalidateToolCache();
}

/**
 * Invalidate the tool cache (call when dynamic tools change)
 */
export function invalidateToolCache(): void {
  toolCache = null;
}

/**
 * Set dynamic tools (replaces all)
 */
export function setDynamicTools(tools: Tool[]): void {
  dynamicTools = tools;
  invalidateToolCache();
}

/**
 * Add a dynamic tool
 */
export function addDynamicTool(tool: Tool): void {
  dynamicTools.push(tool);
  invalidateToolCache();
}

/**
 * Clear dynamic tools
 */
export function clearDynamicTools(): void {
  dynamicTools = [];
  invalidateToolCache();
}

/**
 * Get a tool by name
 */
export function getToolByName(name: string): Tool | undefined {
  return getAllTools().find((t) => t.name === name);
}

/**
 * Execute a tool by name
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = getToolByName(name);
  if (!tool) return `Error: Unknown tool "${name}"`;

  try {
    return await tool.execute(args);
  } catch (error) {
    return `Error executing ${name}: ${getErrorMessage(error)}`;
  }
}

// Re-export tools for direct access
export {
  readFileTool,
  writeFileTool,
  editFileTool,
  bashTool,
  globTool,
  grepTool,
  listDirTool,
  patchTool,
  diffTool,
  todoWriteTool,
  todoReadTool,
  undoTool,
  listBackupsTool,
};

// Re-export optional tools (lazy loaded)
export { webfetchTool } from './webfetch.js';
export { backgroundTaskTool, backgroundOutputTool, backgroundCancelTool, backgroundListTool } from './background.js';
export { sessionListTool, sessionReadTool, sessionSearchTool } from './session.js';
export { skillListTool, skillExecuteTool, skillReadTool } from './skill.js';
export { lspDefinitionTool, lspReferencesTool, lspHoverTool } from './lsp.js';
