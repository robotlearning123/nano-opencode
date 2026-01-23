/**
 * Provider factory with lazy loading
 * Only loads the provider SDK that's actually used
 */

import type { LLMProvider, Config } from '../types.js';
import { ENV_KEY_MAP, type SupportedProvider } from '../constants.js';

/**
 * Create an LLM provider based on configuration
 * Uses dynamic imports for lazy loading - only loads the SDK you need
 */
export async function createProvider(config: Config): Promise<LLMProvider> {
  // Ollama doesn't require an API key
  if (!config.apiKey && config.provider !== 'ollama') {
    const provider = config.provider as SupportedProvider;
    const envVar = ENV_KEY_MAP[provider];
    throw new Error(`No API key for ${config.provider}. Set ${envVar} or run /connect ${provider}`);
  }

  const { apiKey, model, maxTokens } = config;

  switch (config.provider) {
    case 'anthropic': {
      const { AnthropicProvider } = await import('./anthropic.js');
      return new AnthropicProvider(apiKey!, model, maxTokens);
    }
    case 'openai': {
      const { OpenAIProvider } = await import('./openai.js');
      return new OpenAIProvider(apiKey!, model, maxTokens);
    }
    case 'gemini': {
      const { GeminiProvider } = await import('./gemini.js');
      return new GeminiProvider(apiKey!, model, maxTokens);
    }
    case 'ollama': {
      const { OllamaProvider } = await import('./ollama.js');
      // apiKey is used as base URL for Ollama (optional, defaults to localhost:11434)
      return new OllamaProvider(model, apiKey || 'http://localhost:11434');
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
