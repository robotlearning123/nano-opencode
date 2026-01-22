#!/usr/bin/env node
/**
 * nano-opencode TUI Mode
 *
 * Run with: bun src/tui.ts
 * Or after build: nano --tui
 */

import { createTui } from './ui/tui.js'
import { loadConfig } from './config.js'
import Anthropic from '@anthropic-ai/sdk'

async function main() {
  // Load config
  const cfg = loadConfig()

  // Initialize provider (use env vars for baseURL since Config doesn't have it)
  const client = new Anthropic({
    apiKey: cfg.apiKey || process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  })

  const model = cfg.model || process.env.MODEL || 'claude-sonnet-4-20250514'
  const messages: { role: 'user' | 'assistant'; content: string }[] = []

  // Create TUI
  const tui = createTui({
    title: process.cwd().split('/').pop(),
    model: model.split('/').pop() || model,
    onSubmit: async (input: string) => {
      messages.push({ role: 'user', content: input })

      try {
        const response = await client.messages.create({
          model,
          max_tokens: 4096,
          system: 'You are a helpful coding assistant. Be concise.',
          messages,
        })

        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')

        messages.push({ role: 'assistant', content: text })
        tui.addMessage({ role: 'assistant', content: text })
      } catch (err: any) {
        const errorMsg = err.message || String(err)
        tui.addMessage({ role: 'system', content: `Error: ${errorMsg}` })
      }
    },
    onExit: () => {
      console.log('Goodbye!')
      process.exit(0)
    },
  })

  // Handle ctrl+c
  process.on('SIGINT', () => {
    tui.close()
    process.exit(0)
  })

  // Start TUI
  await tui.run()
}

main().catch(console.error)
