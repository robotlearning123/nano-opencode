/**
 * Agent System - loads agents from YAML files with TS fallback
 */

import type { AgentDefinition, AgentInstance, AgentName, Tool } from '../types.js';
import { agentRegistry, filterToolsForAgent } from './registry.js';
import { getAgents, getAgent as getYamlAgent, type AgentYaml } from '../plugin/index.js';
import { getMemoryForPrompt } from '../memory/index.js';

let initialized = false;

/**
 * Convert YAML agent to AgentDefinition
 */
function yamlToDefinition(yaml: AgentYaml): AgentDefinition {
  return {
    name: yaml.name,
    description: yaml.description,
    systemPrompt: yaml.prompt + `\n\nCurrent working directory: ${process.cwd()}`,
    model: yaml.model,
    temperature: yaml.temperature,
    maxTurns: yaml.max_turns,
    allowedTools: yaml.allowed_tools,
    disallowedTools: yaml.disallowed_tools,
    category: yaml.category,
  };
}

/**
 * Initialize the agent system - loads agents from YAML files
 */
export function initAgents(): void {
  if (initialized) return;

  // Load YAML agents from builtin/agents/, ~/.nano/agents/, .nano/agents/
  try {
    const yamlAgents = getAgents();
    for (const { config } of yamlAgents) {
      agentRegistry.register(yamlToDefinition(config));
    }
  } catch {
    // If plugin system fails, load built-in TS definitions as fallback
    loadBuiltinFallback();
  }

  initialized = true;
}

/**
 * Fallback to TypeScript definitions if YAML loading fails
 */
async function loadBuiltinFallback(): Promise<void> {
  try {
    const { builtInAgents } = await import('./definitions.js');
    for (const agent of builtInAgents) {
      if (!agentRegistry.get(agent.name)) {
        agentRegistry.register(agent);
      }
    }
  } catch {
    // Silent fail - no agents available
  }
}

/**
 * Get an agent by name
 */
export function getAgent(name: AgentName): AgentDefinition | undefined {
  initAgents();

  // First check registry
  const registered = agentRegistry.get(name);
  if (registered) return registered;

  // Try loading from YAML directly
  const yamlPlugin = getYamlAgent(name);
  if (yamlPlugin) {
    const definition = yamlToDefinition(yamlPlugin.config);
    agentRegistry.register(definition);
    return definition;
  }

  return undefined;
}

/**
 * Create an agent instance
 */
export function createAgent(
  name: AgentName,
  overrides?: Partial<AgentDefinition>
): AgentInstance | undefined {
  const definition = getAgent(name);
  if (!definition) return undefined;

  const finalDefinition = overrides ? { ...definition, ...overrides } : definition;
  return {
    definition: finalDefinition,
    getTools: (allTools: Tool[]) => filterToolsForAgent(allTools, finalDefinition),
    getSystemPrompt: () => {
      // Inject memory context into system prompt
      const memoryContext = getMemoryForPrompt();
      if (memoryContext) {
        return `${finalDefinition.systemPrompt}\n\n${memoryContext}`;
      }
      return finalDefinition.systemPrompt;
    },
  };
}

/**
 * List all available agents
 */
export function listAgents(): AgentDefinition[] {
  initAgents();
  return agentRegistry.list();
}

/**
 * Get the default agent (sisyphus)
 */
export function getDefaultAgent(): AgentDefinition {
  initAgents();
  return agentRegistry.getDefault();
}

export { agentRegistry, filterToolsForAgent } from './registry.js';
