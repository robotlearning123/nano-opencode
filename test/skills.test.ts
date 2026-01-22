import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { parseSkill, resolveTemplateVariables } from '../src/skills/parser.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_PATH = '/test/path';

function parseTestSkill(name: string, content: string) {
  return parseSkill(name, TEST_PATH, content);
}

describe('Skill System', () => {
  describe('parseSkill', () => {
    it('extracts frontmatter correctly', () => {
      const content = `---
description: Test skill
model: claude-sonnet-4-20250514
temperature: 0.5
tags: [test, demo]
---
Skill content here`;

      const skill = parseTestSkill('test-skill', content);

      assert.strictEqual(skill.name, 'test-skill');
      assert.strictEqual(skill.frontmatter.description, 'Test skill');
      assert.strictEqual(skill.frontmatter.model, 'claude-sonnet-4-20250514');
      assert.strictEqual(skill.frontmatter.temperature, 0.5);
      assert.deepStrictEqual(skill.frontmatter.tags, ['test', 'demo']);
      assert.strictEqual(skill.content, 'Skill content here');
    });

    it('handles missing frontmatter', () => {
      const skill = parseTestSkill('no-front', 'Just content without frontmatter');

      assert.strictEqual(skill.name, 'no-front');
      assert.strictEqual(skill.frontmatter.description, '');
      assert.strictEqual(skill.content, 'Just content without frontmatter');
    });

    it('handles empty content', () => {
      const skill = parseTestSkill('empty', '');

      assert.strictEqual(skill.name, 'empty');
      assert.strictEqual(skill.content, '');
    });

    it('handles multiline descriptions', () => {
      const content = `---
description: A long description
model: gpt-4
---
Content`;

      const skill = parseTestSkill('multi', content);
      assert.strictEqual(skill.frontmatter.description, 'A long description');
    });

    it('parses agent flag correctly', () => {
      const content = `---
description: Agent skill
agent: true
---
Content`;

      const skill = parseTestSkill('agent-skill', content);
      assert.strictEqual(skill.frontmatter.agent, true);
    });
  });

  describe('resolveTemplateVariables', () => {
    let tempDir: string;
    let tempFile: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `skill-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      tempFile = join(tempDir, 'test.txt');
      writeFileSync(tempFile, 'file content');
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('handles {{env:VAR}}', () => {
      process.env.TEST_SKILL_VAR = 'test-value';
      const resolved = resolveTemplateVariables(
        parseTestSkill('env-test', 'Value: {{env:TEST_SKILL_VAR}}')
      );

      assert.ok(resolved.resolvedContent.includes('test-value'));
      delete process.env.TEST_SKILL_VAR;
    });

    it('handles {{cwd}}', () => {
      const resolved = resolveTemplateVariables(parseTestSkill('cwd-test', 'Dir: {{cwd}}'));
      assert.ok(resolved.resolvedContent.includes(process.cwd()));
    });

    it('handles {{date}}', () => {
      const resolved = resolveTemplateVariables(parseTestSkill('date-test', 'Today: {{date}}'));
      assert.ok(/\d{4}-\d{2}-\d{2}/.test(resolved.resolvedContent));
    });

    it('handles {{file:path}}', () => {
      const resolved = resolveTemplateVariables(
        parseTestSkill('file-test', `Content: {{file:${tempFile}}}`)
      );
      assert.ok(resolved.resolvedContent.includes('file content'));
    });

    it('handles {{arg:name}} with provided args', () => {
      const resolved = resolveTemplateVariables(parseTestSkill('arg-test', 'Arg: {{arg:myArg}}'), {
        myArg: 'argument-value',
      });
      assert.ok(resolved.resolvedContent.includes('argument-value'));
    });

    it('records error for missing env var', () => {
      delete process.env.NONEXISTENT_VAR_XYZ;
      const resolved = resolveTemplateVariables(
        parseTestSkill('missing-env', 'Val: {{env:NONEXISTENT_VAR_XYZ}}')
      );

      assert.ok(resolved.errors.length > 0);
      assert.ok(resolved.errors.some((e) => e.includes('NONEXISTENT_VAR_XYZ')));
    });

    it('records error for missing file', () => {
      const resolved = resolveTemplateVariables(
        parseTestSkill('missing-file', 'File: {{file:/nonexistent/path/xyz}}')
      );

      assert.ok(resolved.errors.length > 0);
      assert.ok(resolved.errors.some((e) => e.includes('not found')));
    });

    it('leaves unknown variable types unchanged', () => {
      const resolved = resolveTemplateVariables(
        parseTestSkill('unknown', 'Val: {{unknowntype:value}}')
      );

      assert.ok(resolved.resolvedContent.includes('{{unknowntype:value}}'));
      assert.ok(resolved.errors.some((e) => e.includes('Unknown variable type')));
    });

    it('handles multiple variables', () => {
      process.env.TEST_MULTI = 'multi-val';
      const resolved = resolveTemplateVariables(
        parseTestSkill('multi', 'CWD: {{cwd}}, ENV: {{env:TEST_MULTI}}, DATE: {{date}}')
      );

      assert.ok(resolved.resolvedContent.includes(process.cwd()));
      assert.ok(resolved.resolvedContent.includes('multi-val'));
      assert.ok(/\d{4}-\d{2}-\d{2}/.test(resolved.resolvedContent));
      delete process.env.TEST_MULTI;
    });
  });
});
