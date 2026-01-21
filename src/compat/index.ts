/**
 * Compatibility Layer
 *
 * Provides compatibility with other AI coding agent ecosystems:
 * - OpenCode (sst/opencode)
 * - oh-my-opencode (code-yeongyu/oh-my-opencode)
 */

export {
  loadOpenCodeConfig,
  installPlugins,
  loadOpenCodePlugin,
  initOpenCodeCompat,
  hasOpenCodeConfig,
  getOmoAgents,
  convertOpenCodeTool,
  HOOK_MAPPING,
  type OpenCodeConfig,
  type OpenCodeAgent,
  type OpenCodeMCP,
  type OpenCodePluginContext,
  type OpenCodeToolDef,
  type LoadedOpenCodePlugin,
} from './opencode.js';
