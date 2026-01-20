/**
 * Provider factory for nano-opencode
 * Creates LLM providers based on configuration
 */

import type { LLMProvider, Config } from '../types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { ENV_KEY_MAP, type SupportedProvider } from '../constants.js';

/**
 * Create an LLM provider based on configuration
 * @throws Error if no API key is available
 */
export function createProvider(config: Config): LLMProvider {
  if (!config.apiKey) {
    const provider = config.provider as SupportedProvider;
    const envVar = ENV_KEY_MAP[provider];

    throw new Error(
      `No API key found for ${config.provider}.\n\n` +
      `Set up authentication using one of these methods:\n` +
      `  1. Set the ${envVar} environment variable\n` +
      `  2. Run: nano-opencode and use /connect ${provider}\n` +
      `  3. Add to ~/.config/nano-opencode/config.json:\n` +
      `     {\n` +
      `       "providers": {\n` +
      `         "${provider}": { "apiKey": "{env:${envVar}}" }\n` +
      `       }\n` +
      `     }`
    );
  }

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config.apiKey, config.model, config.maxTokens);
    case 'openai':
      return new OpenAIProvider(config.apiKey, config.model, config.maxTokens);
    case 'gemini':
      return new GeminiProvider(config.apiKey, config.model, config.maxTokens);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export { AnthropicProvider } from './anthropic.js';
export { OpenAIProvider } from './openai.js';
export { GeminiProvider } from './gemini.js';
