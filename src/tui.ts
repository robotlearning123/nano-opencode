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

// Rough token estimate (4 chars ≈ 1 token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function countMessageTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0); // +4 for role overhead
}

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

  // Context compaction threshold (compact when approaching 80k tokens)
  const COMPACT_THRESHOLD = 60000;

  // Compact conversation by summarizing older messages
  async function compactMessages(): Promise<string | null> {
    if (messages.length < 4) return null; // Need at least a few exchanges

    const tokens = countMessageTokens(messages);
    if (tokens < COMPACT_THRESHOLD) return null;

    // Keep last 2 exchanges, summarize the rest
    const toSummarize = messages.slice(0, -4);
    const toKeep = messages.slice(-4);

    try {
      const summaryResponse = await client.messages.create({
        model,
        max_tokens: 1024,
        system:
          'Summarize this conversation concisely, preserving key context, decisions, and code snippets. Output only the summary.',
        messages: [
          {
            role: 'user',
            content: toSummarize.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
          },
        ],
      });

      const summary = summaryResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      // Replace messages with summary + recent
      messages.length = 0;
      messages.push({ role: 'user', content: `[Previous conversation summary]\n${summary}` });
      messages.push({
        role: 'assistant',
        content: 'Understood. I have the context from our previous conversation.',
      });
      messages.push(...toKeep);

      return `Compacted ${toSummarize.length} messages → ${countMessageTokens(messages)} tokens`;
    } catch {
      return null;
    }
  }

  // Create TUI
  const tui = createTui({
    title: path.basename(process.cwd()),
    model: model.split('/').pop() || model,
    onSubmit: async (input: string) => {
      // Handle /compact command
      if (input.toLowerCase() === '/compact') {
        tui.addMessage({ role: 'system', content: 'Compacting conversation...' });
        const result = await compactMessages();
        tui.updateLastMessage(
          result || 'Nothing to compact (conversation too short or under threshold)'
        );
        return;
      }

      messages.push({ role: 'user', content: input });

      try {
        // Auto-compact if needed
        const compactResult = await compactMessages();
        if (compactResult) {
          tui.addMessage({ role: 'system', content: compactResult });
        }

        // Start streaming
        tui.addMessage({ role: 'assistant', content: '' });

        const stream = client.messages.stream({
          model,
          max_tokens: 4096,
          system: 'You are a helpful coding assistant. Be concise.',
          messages,
        });

        let fullText = '';
        stream.on('text', (text) => {
          fullText += text;
          tui.updateLastMessage(fullText);
        });

        await stream.finalMessage();
        messages.push({ role: 'assistant', content: fullText });
      } catch (err: unknown) {
        // Remove failed user message from conversation history
        messages.pop();
        const errorMsg = err instanceof Error ? err.message : String(err);
        tui.updateLastMessage(`Error: ${errorMsg}`);
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
