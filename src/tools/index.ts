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
import { webSearchTool } from './websearch.js';
import { imageTool } from './image.js';
import { gitCommitTool, gitStatusTool, gitDiffTool } from './git.js';
import { sandboxTool, sandboxInfoTool } from './sandbox.js';
import { spawnAgentTool, listAgentsTool } from './spawn.js';

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
  webSearchTool,
  imageTool,
  gitCommitTool,
  gitStatusTool,
  gitDiffTool,
  sandboxTool,
  sandboxInfoTool,
  spawnAgentTool,
  listAgentsTool,
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

// Read-only tools that can run in parallel safely
const READ_ONLY_TOOLS = new Set([
  'glob',
  'grep',
  'read_file',
  'list_dir',
  'todo_read',
  'list_backups',
  'webfetch',
  'web_search',
  'read_image',
  'lsp_definition',
  'lsp_references',
  'lsp_hover',
  'session_list',
  'session_read',
  'session_search',
  'skill_list',
  'skill_read',
  'background_list',
  'background_output',
  'git_status',
  'git_diff',
  'sandbox_info',
  'list_agents',
]);

/**
 * Check if a tool is read-only (safe to run in parallel)
 */
export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name);
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
export { webSearchTool } from './websearch.js';
export { imageTool } from './image.js';
export {
  backgroundTaskTool,
  backgroundOutputTool,
  backgroundCancelTool,
  backgroundListTool,
} from './background.js';
export { sessionListTool, sessionReadTool, sessionSearchTool } from './session.js';
export { skillListTool, skillExecuteTool, skillReadTool } from './skill.js';
export { lspDefinitionTool, lspReferencesTool, lspHoverTool } from './lsp.js';
export { gitCommitTool, gitStatusTool, gitDiffTool } from './git.js';
export { sandboxTool, sandboxInfoTool } from './sandbox.js';
export { spawnAgentTool, listAgentsTool } from './spawn.js';
