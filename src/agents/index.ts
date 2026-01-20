/**
 * Agent System - exports and initialization
 */

import type { AgentDefinition, AgentInstance, AgentName, Tool } from '../types.js';
import { agentRegistry, filterToolsForAgent } from './registry.js';
import { builtInAgents } from './definitions.js';

let initialized = false;

/**
 * Initialize the agent system - registers built-in agents
 */
export function initAgents(): void {
  if (initialized) return;
  for (const agent of builtInAgents) {
    agentRegistry.register(agent);
  }
  initialized = true;
}

/**
 * Get an agent by name
 */
export function getAgent(name: AgentName): AgentDefinition | undefined {
  initAgents();
  return agentRegistry.get(name);
}

/**
 * Create an agent instance
 */
export function createAgent(name: AgentName, overrides?: Partial<AgentDefinition>): AgentInstance | undefined {
  initAgents();
  const definition = agentRegistry.get(name);
  if (!definition) return undefined;

  const finalDefinition = overrides ? { ...definition, ...overrides } : definition;
  return {
    definition: finalDefinition,
    getTools: (allTools: Tool[]) => filterToolsForAgent(allTools, finalDefinition),
    getSystemPrompt: () => finalDefinition.systemPrompt,
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
