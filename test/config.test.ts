import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { loadConfig, saveConfig, getConfigPath } from '../src/config.js';
import { existsSync, unlinkSync } from 'fs';

describe('Configuration', () => {
  const originalEnv = { ...process.env };

  before(() => {
    // Clear environment variables for clean testing
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  after(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up config file
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      try {
        unlinkSync(configPath);
      } catch {
        // Ignore errors
      }
    }
  });

  it('should load default configuration', () => {
    const config = loadConfig();

    assert.strictEqual(config.provider, 'anthropic');
    assert.strictEqual(config.model, 'claude-sonnet-4-20250514');
    assert.strictEqual(config.maxTokens, 8192);
  });

  it('should load configuration from environment variables', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-123';

    const config = loadConfig();

    assert.strictEqual(config.provider, 'anthropic');
    assert.strictEqual(config.apiKey, 'test-key-123');
  });

  it('should prioritize OpenAI when OPENAI_API_KEY is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = 'openai-test-key';

    const config = loadConfig();

    assert.strictEqual(config.provider, 'openai');
    assert.strictEqual(config.apiKey, 'openai-test-key');
    assert.strictEqual(config.model, 'gpt-4o');
  });

  it('should save and load configuration', () => {
    // Clear env vars so they don't override saved config
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    saveConfig({ provider: 'openai', model: 'gpt-4-turbo' });

    const config = loadConfig();

    assert.strictEqual(config.model, 'gpt-4-turbo');
  });
});
