#!/usr/bin/env node
/**
 * nano-opencode TUI Mode
 *
 * Run with: bun src/tui.ts
 * Or after build: nano --tui
 */

import { config } from 'dotenv';
config();

import path from 'node:path';
import { createTui } from './ui/tui.js';
import { loadConfig } from './config.js';
import Anthropic from '@anthropic-ai/sdk';

async function main() {
  // Load config
  const cfg = loadConfig();

  // Validate provider - TUI only supports Anthropic
  if (cfg.provider && cfg.provider !== 'anthropic') {
    console.error(`TUI currently supports only Anthropic (detected: ${cfg.provider}).`);
    process.exit(1);
  }

  // Validate API key
  const apiKey = cfg.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Missing ANTHROPIC_API_KEY (or apiKey in config).');
    process.exit(1);
  }

  // Initialize provider
  const client = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });

  const model = cfg.model || process.env.MODEL || 'claude-sonnet-4-20250514';
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  // Create TUI
  const tui = createTui({
    title: path.basename(process.cwd()),
    model: model.split('/').pop() || model,
    onSubmit: async (input: string) => {
      messages.push({ role: 'user', content: input });

      try {
        const response = await client.messages.create({
          model,
          max_tokens: 4096,
          system: 'You are a helpful coding assistant. Be concise.',
          messages,
        });

        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n');

        messages.push({ role: 'assistant', content: text });
        tui.addMessage({ role: 'assistant', content: text });
      } catch (err: unknown) {
        // Remove failed user message from conversation history
        messages.pop();
        const errorMsg = err instanceof Error ? err.message : String(err);
        tui.addMessage({ role: 'system', content: `Error: ${errorMsg}` });
      }
    },
    onExit: () => {
      console.log('Goodbye!');
      process.exit(0);
    },
  });

  // Handle ctrl+c
  process.on('SIGINT', () => {
    tui.close();
    process.exit(0);
  });

  // Start TUI
  await tui.run();
}

main().catch(console.error);
