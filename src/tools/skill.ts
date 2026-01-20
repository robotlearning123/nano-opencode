/**
 * Skill Tool
 *
 * Execute skills by name, resolving template variables.
 */

import type { Tool } from '../types.js';
import { getSkill, listSkills, resolveTemplateVariables } from '../skills/index.js';

/**
 * skill_list - List available skills
 */
export const skillListTool: Tool = {
  name: 'skill_list',
  description: 'List all available skills. Skills are markdown templates that extend agent capabilities with specialized prompts and instructions.',
  parameters: {
    type: 'object',
    properties: {
      tag: {
        type: 'string',
        description: 'Optional tag to filter skills by',
      },
    },
    required: [],
  },
  execute: async (args): Promise<string> => {
    const tag = args.tag as string | undefined;
    const skills = await listSkills();

    if (skills.length === 0) {
      return 'No skills found. Create skills in ~/.nano-opencode/skills/ or ./.nano-opencode/skills/';
    }

    // Filter by tag if provided
    const filtered = tag
      ? skills.filter((s) => s.frontmatter.tags?.includes(tag))
      : skills;

    if (filtered.length === 0) {
      return `No skills found with tag: ${tag}`;
    }

    const lines = ['Available skills:'];
    for (const skill of filtered) {
      const tags = skill.frontmatter.tags?.length
        ? ` [${skill.frontmatter.tags.join(', ')}]`
        : '';
      const agent = skill.frontmatter.agent ? ' (agent)' : '';
      lines.push(`\n${skill.name}${agent}${tags}`);
      lines.push(`  ${skill.frontmatter.description || '(no description)'}`);
      lines.push(`  Path: ${skill.path}`);
    }

    return lines.join('\n');
  },
};

/**
 * skill_execute - Execute a skill
 */
export const skillExecuteTool: Tool = {
  name: 'skill_execute',
  description: 'Execute a skill by name. Returns the resolved skill content which can be used as a prompt or instruction set. Use skill_list to see available skills.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the skill to execute',
      },
      args: {
        type: 'string',
        description: 'Arguments to pass to the skill (JSON object format, e.g., {"key": "value"})',
      },
    },
    required: ['name'],
  },
  execute: async (args): Promise<string> => {
    const skillName = args.name as string;
    const argsStr = args.args as string | undefined;

    const skill = await getSkill(skillName);
    if (!skill) {
      const available = await listSkills();
      const names = available.map((s) => s.name).join(', ');
      return `Skill not found: ${skillName}\nAvailable skills: ${names || 'none'}`;
    }

    // Parse skill arguments if provided
    let skillArgs: Record<string, string> = {};
    if (argsStr) {
      try {
        skillArgs = JSON.parse(argsStr);
      } catch {
        return `Invalid skill arguments (must be JSON object): ${argsStr}`;
      }
    }

    // Resolve template variables
    const resolved = resolveTemplateVariables(skill, skillArgs);

    // Build result
    const lines: string[] = [];

    if (resolved.errors.length > 0) {
      lines.push('Warnings:');
      for (const error of resolved.errors) {
        lines.push(`  - ${error}`);
      }
      lines.push('');
    }

    // Add metadata
    lines.push(`Skill: ${skill.name}`);
    if (skill.frontmatter.model) {
      lines.push(`Model: ${skill.frontmatter.model}`);
    }
    if (skill.frontmatter.agent) {
      lines.push('Mode: Agent (spawns as sub-agent)');
    }
    lines.push('');
    lines.push('--- Content ---');
    lines.push(resolved.resolvedContent);

    return lines.join('\n');
  },
};

/**
 * skill_read - Read a skill's raw content
 */
export const skillReadTool: Tool = {
  name: 'skill_read',
  description: 'Read the raw content of a skill file without resolving template variables. Useful for inspecting or modifying skills.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the skill to read',
      },
    },
    required: ['name'],
  },
  execute: async (args): Promise<string> => {
    const skillName = args.name as string;

    const skill = await getSkill(skillName);
    if (!skill) {
      return `Skill not found: ${skillName}`;
    }

    const lines: string[] = [];
    lines.push(`Skill: ${skill.name}`);
    lines.push(`Path: ${skill.path}`);
    lines.push('');
    lines.push('--- Frontmatter ---');
    lines.push(`description: ${skill.frontmatter.description}`);
    if (skill.frontmatter.model) lines.push(`model: ${skill.frontmatter.model}`);
    if (skill.frontmatter.agent) lines.push(`agent: ${skill.frontmatter.agent}`);
    if (skill.frontmatter.tags) lines.push(`tags: [${skill.frontmatter.tags.join(', ')}]`);
    if (skill.frontmatter.temperature) lines.push(`temperature: ${skill.frontmatter.temperature}`);
    if (skill.frontmatter.maxTurns) lines.push(`maxTurns: ${skill.frontmatter.maxTurns}`);
    lines.push('');
    lines.push('--- Content (raw) ---');
    lines.push(skill.content);

    return lines.join('\n');
  },
};
