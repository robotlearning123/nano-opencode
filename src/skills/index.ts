/**
 * Skill System
 *
 * Skills are markdown templates that extend agent capabilities.
 */

export { parseSkill, resolveTemplateVariables } from './parser.js';
export {
  discoverSkills,
  getSkill,
  listSkills,
  searchSkillsByTag,
  clearSkillCache,
  getSkillDirectories,
} from './discovery.js';
export type { Skill, SkillFrontmatter, ResolvedSkill, TemplateVariableType } from './types.js';
