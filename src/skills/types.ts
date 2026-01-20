/**
 * Skill System Types
 *
 * Skills are markdown templates that extend agent capabilities with
 * specialized prompts and instructions.
 */

/**
 * Skill frontmatter metadata parsed from YAML header
 */
export interface SkillFrontmatter {
  description: string;
  model?: string;           // Optional model override
  agent?: boolean;          // If true, spawn as sub-agent
  tags?: string[];          // For categorization
  temperature?: number;     // Optional temperature override
  maxTurns?: number;        // Max turns if running as agent
}

/**
 * Parsed skill definition
 */
export interface Skill {
  name: string;             // Skill identifier (filename without .md)
  path: string;             // Full path to skill file
  frontmatter: SkillFrontmatter;
  content: string;          // Skill content (markdown)
}

/**
 * Result of resolving template variables
 */
export interface ResolvedSkill {
  skill: Skill;
  resolvedContent: string;  // Content with variables resolved
  errors: string[];         // Any errors during resolution
}

/**
 * Template variable types supported in skills
 *
 * Syntax:
 *   {{file:path/to/file}}   - Include file content
 *   {{command:cmd args}}    - Include command output
 *   {{env:VAR_NAME}}        - Include environment variable
 *   {{arg:name}}            - Include skill argument
 *   {{date}}                - Current date
 *   {{cwd}}                 - Current working directory
 */
export type TemplateVariableType =
  | 'file'
  | 'command'
  | 'env'
  | 'arg'
  | 'date'
  | 'cwd';
