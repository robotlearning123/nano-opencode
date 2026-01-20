#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { loadConfig } from './config.js';
import { createProvider } from './providers/index.js';
import { CLI } from './cli.js';
import { closeDb } from './store.js';
import { getErrorMessage } from './constants.js';
import { initializeMCP, shutdownMCP } from './mcp/index.js';

// Load environment variables
config();

const program = new Command();

program
  .name('nano')
  .description('A minimal AI coding assistant for the terminal')
  .version('0.0.1')
  .option('-s, --session <id>', 'Resume a specific session')
  .option('-p, --provider <name>', 'LLM provider (anthropic or openai)')
  .option('-m, --model <name>', 'Model to use')
  .option('--prompt <text>', 'Run a single prompt and exit')
  .action(async (options) => {
    const appConfig = loadConfig();

    // Override with CLI options
    if (options.provider) {
      appConfig.provider = options.provider;
    }
    if (options.model) {
      appConfig.model = options.model;
    }

    try {
      // Initialize MCP servers if configured
      if (appConfig.mcp?.servers) {
        await initializeMCP(appConfig.mcp);
      }

      const provider = createProvider(appConfig);

      if (options.prompt) {
        // Non-interactive mode: run single prompt
        await runSinglePrompt(provider, options.prompt);
      } else {
        // Interactive mode
        const cli = new CLI(provider, options.session);
        await cli.start();
      }
    } catch (error) {
      console.error(`Error: ${getErrorMessage(error)}`);
      process.exit(1);
    } finally {
      await shutdownMCP();
      closeDb();
    }
  });

async function runSinglePrompt(provider: ReturnType<typeof createProvider>, prompt: string): Promise<void> {
  const { getAllTools, executeTool } = await import('./tools/index.js');
  const { toolBox } = await import('./ui/index.js');
  const chalk = (await import('chalk')).default;

  const messages = [{ role: 'user' as const, content: prompt }];
  let hasOutput = false;

  const response = await provider.chat(messages, getAllTools(), (chunk) => {
    if (chunk.type === 'text' && chunk.content) {
      if (!hasOutput) {
        console.log(chalk.blue.bold('\n◆ Assistant'));
        console.log(chalk.dim('─'.repeat(50)));
        hasOutput = true;
      }
      process.stdout.write(chalk.white(chunk.content));
    } else if (chunk.type === 'tool_use' && chunk.toolCall) {
      console.log(chalk.yellow(`\n⚡ Using: ${chunk.toolCall.name}`));
    }
  });

  if (hasOutput) {
    console.log('\n' + chalk.dim('─'.repeat(50)));
  }

  // Handle tool calls in non-interactive mode
  if (response.toolCalls && response.toolCalls.length > 0) {
    for (const toolCall of response.toolCalls) {
      const result = await executeTool(toolCall.name, toolCall.arguments);
      console.log(toolBox(toolCall.name, result));
    }
  }
}

program.parse();
