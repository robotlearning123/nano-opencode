import type { LLMProvider, Config } from '../types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export function createProvider(config: Config): LLMProvider {
  if (!config.apiKey) {
    throw new Error(
      `No API key found. Set ${config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} environment variable.`
    );
  }

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config.apiKey, config.model, config.maxTokens);
    case 'openai':
      return new OpenAIProvider(config.apiKey, config.model, config.maxTokens);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export { AnthropicProvider } from './anthropic.js';
export { OpenAIProvider } from './openai.js';
