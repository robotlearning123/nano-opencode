import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import {
  initAgents,
  getAgent,
  createAgent,
  listAgents,
  getDefaultAgent,
  filterToolsForAgent,
} from '../src/agents/index.js';
import type { Tool, AgentDefinition } from '../src/types.js';

function createMockTool(name: string): Tool {
  return {
    name,
    description: `Mock ${name}`,
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async () => '',
  };
}

const mockTools: Tool[] = [
  createMockTool('read_file'),
  createMockTool('write_file'),
  createMockTool('execute_bash'),
  createMockTool('search_files'),
];

function createTestDefinition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: 'test',
    description: 'Test agent',
    systemPrompt: 'Test prompt',
    ...overrides,
  };
}

describe('Agent System', () => {
  before(() => {
    initAgents();
  });

  describe('filterToolsForAgent', () => {
    it('returns all tools when no restrictions', () => {
      const filtered = filterToolsForAgent(mockTools, createTestDefinition());
      assert.strictEqual(filtered.length, 4);
    });

    it('filters by allowedTools whitelist', () => {
      const definition = createTestDefinition({ allowedTools: ['read_file', 'search_files'] });
      const filtered = filterToolsForAgent(mockTools, definition);

      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.some((t) => t.name === 'read_file'));
      assert.ok(filtered.some((t) => t.name === 'search_files'));
      assert.ok(!filtered.some((t) => t.name === 'write_file'));
    });

    it('filters by disallowedTools blacklist', () => {
      const definition = createTestDefinition({ disallowedTools: ['execute_bash', 'write_file'] });
      const filtered = filterToolsForAgent(mockTools, definition);

      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.some((t) => t.name === 'read_file'));
      assert.ok(filtered.some((t) => t.name === 'search_files'));
    });

    it('blacklist takes precedence over whitelist', () => {
      const definition = createTestDefinition({
        allowedTools: ['read_file', 'write_file'],
        disallowedTools: ['write_file'],
      });
      const filtered = filterToolsForAgent(mockTools, definition);

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].name, 'read_file');
    });

    it('handles empty allowedTools array', () => {
      const definition = createTestDefinition({ allowedTools: [] });
      const filtered = filterToolsForAgent(mockTools, definition);
      assert.strictEqual(filtered.length, 4);
    });
  });

  describe('Agent Registry', () => {
    it('getAgent returns sisyphus agent', () => {
      const agent = getAgent('sisyphus');
      assert.ok(agent);
      assert.strictEqual(agent.name, 'sisyphus');
      assert.ok(agent.systemPrompt.length > 0);
    });

    it('getAgent returns undefined for unknown agent', () => {
      const agent = getAgent('nonexistent-agent-xyz');
      assert.strictEqual(agent, undefined);
    });

    it('createAgent returns agent instance', () => {
      const instance = createAgent('sisyphus');
      assert.ok(instance);
      assert.strictEqual(instance.definition.name, 'sisyphus');
    });

    it('createAgent returns undefined for unknown agent', () => {
      const instance = createAgent('nonexistent-agent-xyz');
      assert.strictEqual(instance, undefined);
    });

    it('listAgents returns essential built-in agents', () => {
      const agents = listAgents();
      // At minimum, should have 5 essential agents (more if TS fallback loads)
      assert.ok(agents.length >= 5);

      const names = agents.map((a) => a.name);
      // Essential agents (from YAML or TS fallback)
      assert.ok(names.includes('sisyphus'));
      assert.ok(names.includes('oracle'));
      assert.ok(names.includes('explore'));
      assert.ok(names.includes('junior'));
      assert.ok(names.includes('prometheus'));
    });

    it('getDefaultAgent returns sisyphus', () => {
      const defaultAgent = getDefaultAgent();
      assert.strictEqual(defaultAgent.name, 'sisyphus');
    });
  });

  describe('Agent Instance', () => {
    it('getTools filters correctly', () => {
      const instance = createAgent('oracle');
      assert.ok(instance);

      const tools = instance.getTools(mockTools);
      // Oracle agent should have limited tools (read-only)
      assert.ok(Array.isArray(tools));
    });

    it('getSystemPrompt returns non-empty string', () => {
      const instance = createAgent('sisyphus');
      assert.ok(instance);

      const prompt = instance.getSystemPrompt();
      assert.ok(typeof prompt === 'string');
      assert.ok(prompt.length > 0);
    });

    it('createAgent with overrides applies them', () => {
      const instance = createAgent('sisyphus', {
        temperature: 0.5,
        maxTurns: 10,
      });
      assert.ok(instance);
      assert.strictEqual(instance.definition.temperature, 0.5);
      assert.strictEqual(instance.definition.maxTurns, 10);
    });
  });
});
