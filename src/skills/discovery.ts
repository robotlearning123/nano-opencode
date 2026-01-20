/**
 * Skill Discovery
 *
 * Discovers and loads skills from standard directories.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import type { Skill } from './types.js';
import { parseSkill } from './parser.js';

/**
 * Standard skill directories (checked in order)
 */
const SKILL_DIRS = [
  join(homedir(), '.nano-opencode', 'skills'),     // User skills
  join(process.cwd(), '.nano-opencode', 'skills'), // Project skills
];

/**
 * Cache for discovered skills
 */
let skillCache: Map<string, Skill> | null = null;

/**
 * Discover all skills from standard directories
 */
export async function discoverSkills(force = false): Promise<Map<string, Skill>> {
  if (skillCache && !force) {
    return skillCache;
  }

  const skills = new Map<string, Skill>();

  for (const dir of SKILL_DIRS) {
    if (!existsSync(dir)) {
      continue;
    }

    try {
      const files = readdirSync(dir);

      for (const file of files) {
        if (!file.endsWith('.md')) {
          continue;
        }

        const filePath = join(dir, file);
        const stat = statSync(filePath);

        if (!stat.isFile()) {
          continue;
        }

        try {
          const content = readFileSync(filePath, 'utf-8');
          const name = basename(file, '.md');
          const skill = parseSkill(name, filePath, content);

          // Later directories override earlier ones (project > user)
          skills.set(name, skill);
        } catch (error) {
          console.error(`[Skills] Error parsing ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error(`[Skills] Error reading directory ${dir}:`, error);
    }
  }

  skillCache = skills;
  return skills;
}

/**
 * Get a specific skill by name
 */
export async function getSkill(name: string): Promise<Skill | undefined> {
  const skills = await discoverSkills();
  return skills.get(name);
}

/**
 * List all available skills
 */
export async function listSkills(): Promise<Skill[]> {
  const skills = await discoverSkills();
  return Array.from(skills.values());
}

/**
 * Search skills by tag
 */
export async function searchSkillsByTag(tag: string): Promise<Skill[]> {
  const skills = await discoverSkills();
  return Array.from(skills.values()).filter(
    (skill) => skill.frontmatter.tags?.includes(tag)
  );
}

/**
 * Clear the skill cache (force reload on next discovery)
 */
export function clearSkillCache(): void {
  skillCache = null;
}

/**
 * Get skill directories
 */
export function getSkillDirectories(): string[] {
  return [...SKILL_DIRS];
}
