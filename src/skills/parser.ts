/**
 * Skill Parser
 *
 * Parses skill markdown files with frontmatter and resolves template variables.
 * Note: Commands in skill templates are user-defined and executed intentionally.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import type { Skill, SkillFrontmatter, ResolvedSkill } from './types.js';

/**
 * Parse a skill file content into a Skill object
 */
export function parseSkill(name: string, path: string, content: string): Skill {
  const { frontmatter, body } = parseFrontmatter(content);

  return {
    name,
    path,
    frontmatter,
    content: body.trim(),
  };
}

/**
 * Parse YAML-like frontmatter from skill content
 */
function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    // No frontmatter, return defaults
    return {
      frontmatter: { description: '' },
      body: content,
    };
  }

  const [, yamlContent, body] = match;
  const parsed = parseSimpleYaml(yamlContent);

  return {
    frontmatter: {
      description: typeof parsed.description === 'string' ? parsed.description : '',
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      agent: parsed.agent === true || parsed.agent === 'true',
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : undefined,
      temperature: typeof parsed.temperature === 'number' ? parsed.temperature : undefined,
      maxTurns: typeof parsed.maxTurns === 'number' ? parsed.maxTurns : undefined,
    },
    body,
  };
}

/**
 * Parse simple YAML (key: value format)
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    // Handle different value types
    if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      value = Number(value);
    } else if ((value as string).startsWith('[') && (value as string).endsWith(']')) {
      // Simple array parsing
      const arrayContent = (value as string).slice(1, -1);
      value = arrayContent.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
    } else if ((value as string).startsWith('"') || (value as string).startsWith("'")) {
      // Remove quotes
      value = (value as string).slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Resolve template variables in skill content
 *
 * Note: The {{command:...}} template executes user-defined commands from skill files.
 * This is intentional - skills are user-authored and trusted.
 */
export function resolveTemplateVariables(
  skill: Skill,
  args: Record<string, string> = {}
): ResolvedSkill {
  const errors: string[] = [];
  let content = skill.content;

  // Pattern: {{type:value}} or {{type}}
  const variableRegex = /\{\{(\w+)(?::([^}]+))?\}\}/g;

  content = content.replace(variableRegex, (match, type, value) => {
    try {
      switch (type) {
        case 'file':
          return resolveFileVariable(value, errors);

        case 'command':
          return resolveCommandVariable(value, errors);

        case 'env':
          return resolveEnvVariable(value, errors);

        case 'arg':
          return resolveArgVariable(value, args, errors);

        case 'date':
          return new Date().toISOString().split('T')[0];

        case 'cwd':
          return process.cwd();

        default:
          errors.push(`Unknown variable type: ${type}`);
          return match;
      }
    } catch (error) {
      errors.push(
        `Error resolving ${match}: ${error instanceof Error ? error.message : String(error)}`
      );
      return match;
    }
  });

  return {
    skill,
    resolvedContent: content,
    errors,
  };
}

function resolveFileVariable(path: string, errors: string[]): string {
  if (!path) {
    errors.push('File variable requires a path');
    return '';
  }

  // Expand ~ to home directory
  const expandedPath = path.replace(/^~/, process.env.HOME || '');

  if (!existsSync(expandedPath)) {
    errors.push(`File not found: ${path}`);
    return `[File not found: ${path}]`;
  }

  try {
    return readFileSync(expandedPath, 'utf-8');
  } catch (error) {
    errors.push(
      `Error reading file ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
    return `[Error reading: ${path}]`;
  }
}

/**
 * Execute a command from a skill template.
 * Commands in skill files are user-defined and trusted.
 */
function resolveCommandVariable(command: string, errors: string[]): string {
  if (!command) {
    errors.push('Command variable requires a command');
    return '';
  }

  try {
    // User-defined command from skill file - intentionally executes shell commands
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim();
  } catch {
    errors.push(`Command failed: ${command}`);
    return `[Command failed: ${command}]`;
  }
}

function resolveEnvVariable(name: string, errors: string[]): string {
  if (!name) {
    errors.push('Env variable requires a name');
    return '';
  }

  const value = process.env[name];
  if (value === undefined) {
    errors.push(`Environment variable not set: ${name}`);
    return `[Env not set: ${name}]`;
  }

  return value;
}

function resolveArgVariable(name: string, args: Record<string, string>, errors: string[]): string {
  if (!name) {
    errors.push('Arg variable requires a name');
    return '';
  }

  const value = args[name];
  if (value === undefined) {
    errors.push(`Argument not provided: ${name}`);
    return `[Arg not provided: ${name}]`;
  }

  return value;
}
