/**
 * Agent Registry - manages agent definitions and YAML loading
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { AgentDefinition, AgentName, AgentYamlConfig, Tool } from '../types.js';

const AGENT_DIRS = [
  join(homedir(), '.nano-opencode', 'agents'),
  join(process.cwd(), '.nano-opencode', 'agents'),
];

/**
 * Filter tools based on agent's allowed/disallowed tools
 */
export function filterToolsForAgent(tools: Tool[], definition: AgentDefinition): Tool[] {
  let filtered = [...tools];

  if (definition.allowedTools?.length) {
    filtered = filtered.filter((t) => definition.allowedTools!.includes(t.name));
  }

  if (definition.disallowedTools?.length) {
    filtered = filtered.filter((t) => !definition.disallowedTools!.includes(t.name));
  }

  return filtered;
}

/**
 * Parse simple YAML (handles basic key: value pairs and multiline strings)
 */
function parseSimpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let currentKey: string | null = null;
  let multilineValue: string[] = [];
  let inMultiline = false;
  let multilineIndent = 0;

  for (const line of lines) {
    if (!inMultiline && (line.trim().startsWith('#') || line.trim() === '')) {
      continue;
    }

    if (inMultiline) {
      const indent = line.search(/\S|$/);
      if (indent > multilineIndent || line.trim() === '') {
        multilineValue.push(line.slice(multilineIndent));
        continue;
      }
      if (currentKey) {
        result[currentKey] = multilineValue.join('\n').trim();
      }
      inMultiline = false;
      currentKey = null;
      multilineValue = [];
    }

    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, rawValue] = match;
      const value = rawValue.trim();

      if (value === '|' || value === '>') {
        currentKey = key;
        inMultiline = true;
        multilineIndent = line.search(/\S|$/) + 2;
        multilineValue = [];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        const items = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''));
        result[key] = items.filter((s) => s !== '');
      } else if (value === 'true' || value === 'false') {
        result[key] = value === 'true';
      } else if (!isNaN(Number(value)) && value !== '') {
        result[key] = Number(value);
      } else {
        result[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  if (inMultiline && currentKey) {
    result[currentKey] = multilineValue.join('\n').trim();
  }

  return result;
}

/**
 * Convert YAML config to agent definition
 */
function yamlToDefinition(yaml: AgentYamlConfig): AgentDefinition {
  return {
    name: yaml.name,
    description: yaml.description,
    systemPrompt: yaml.system_prompt,
    model: yaml.model,
    temperature: yaml.temperature,
    maxTurns: yaml.max_turns,
    allowedTools: yaml.allowed_tools,
    disallowedTools: yaml.disallowed_tools,
    category: yaml.category,
  };
}

/**
 * Agent Registry class
 */
class AgentRegistry {
  private agents = new Map<AgentName, AgentDefinition>();
  private loaded = false;

  register(definition: AgentDefinition): void {
    this.agents.set(definition.name, definition);
  }

  unregister(name: AgentName): void {
    this.agents.delete(name);
  }

  get(name: AgentName): AgentDefinition | undefined {
    this.ensureLoaded();
    return this.agents.get(name);
  }

  list(): AgentDefinition[] {
    this.ensureLoaded();
    return Array.from(this.agents.values());
  }

  getDefault(): AgentDefinition {
    this.ensureLoaded();
    return this.agents.get('sisyphus')!;
  }

  reload(): void {
    this.agents.clear();
    this.loaded = false;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loadFromDirs();
    this.loaded = true;
  }

  private loadFromDirs(): void {
    for (const dir of AGENT_DIRS) {
      if (!existsSync(dir)) continue;

      try {
        for (const file of readdirSync(dir)) {
          if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
          this.loadYamlFile(join(dir, file));
        }
      } catch {
        // Directory not readable, skip
      }
    }
  }

  private loadYamlFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseSimpleYaml(content);

      if (typeof parsed.name !== 'string' || typeof parsed.system_prompt !== 'string') {
        return;
      }

      const yaml: AgentYamlConfig = {
        name: parsed.name,
        description: typeof parsed.description === 'string' ? parsed.description : '',
        system_prompt: parsed.system_prompt,
        model: typeof parsed.model === 'string' ? parsed.model : undefined,
        temperature: typeof parsed.temperature === 'number' ? parsed.temperature : undefined,
        max_turns: typeof parsed.max_turns === 'number' ? parsed.max_turns : undefined,
        allowed_tools: Array.isArray(parsed.allowed_tools)
          ? (parsed.allowed_tools as string[])
          : undefined,
        disallowed_tools: Array.isArray(parsed.disallowed_tools)
          ? (parsed.disallowed_tools as string[])
          : undefined,
        category:
          typeof parsed.category === 'string'
            ? (parsed.category as AgentYamlConfig['category'])
            : undefined,
      };

      this.register(yamlToDefinition(yaml));
    } catch (err) {
      console.error(`Warning: Failed to load agent from ${filePath}: ${err}`);
    }
  }
}

export const agentRegistry = new AgentRegistry();
