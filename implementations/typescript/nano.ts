#!/usr/bin/env bun
/**
 * nano-opencode: Minimal AI coding agent (~250 LOC)
 * Usage: bun nano.ts "your prompt here"
 *        bun nano.ts  (interactive mode)
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { createInterface } from 'readline';
import { globSync } from 'glob';

// === TOOLS (7 essential) ===
const tools: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read file contents',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Write content to file',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  {
    name: 'edit_file',
    description: 'Replace old_string with new_string in file',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] },
  },
  {
    name: 'bash',
    description: 'Run shell command (use sh -c for complex commands)',
    input_schema: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, required: ['command'] },
  },
  {
    name: 'glob',
    description: 'Find files matching pattern',
    input_schema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
  },
  {
    name: 'grep',
    description: 'Search for pattern in files',
    input_schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] },
  },
  {
    name: 'list_dir',
    description: 'List directory contents',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
];

// === TOOL EXECUTION ===
function executeTool(name: string, input: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'read_file': {
        const path = input.path as string;
        return existsSync(path) ? readFileSync(path, 'utf-8') : `Error: File not found: ${path}`;
      }

      case 'write_file': {
        const path = input.path as string;
        const content = input.content as string;
        writeFileSync(path, content);
        return `Wrote ${content.length} bytes to ${path}`;
      }

      case 'edit_file': {
        const path = input.path as string;
        if (!existsSync(path)) return `Error: File not found: ${path}`;
        const content = readFileSync(path, 'utf-8');
        const oldStr = input.old_string as string;
        const newStr = input.new_string as string;
        if (!content.includes(oldStr)) return `Error: old_string not found in file`;
        writeFileSync(path, content.replace(oldStr, newStr));
        return `Edited ${path}`;
      }

      case 'bash': {
        const cmd = input.command as string;
        const args = (input.args as string[]) || [];
        // Use sh -c for shell features, or direct command
        const result = args.length > 0
          ? execFileSync(cmd, args, { encoding: 'utf-8', timeout: 30000 })
          : execFileSync('sh', ['-c', cmd], { encoding: 'utf-8', timeout: 30000 });
        return result.slice(0, 50000);
      }

      case 'glob': {
        const pattern = input.pattern as string;
        return globSync(pattern, { cwd: process.cwd() }).slice(0, 100).join('\n') || 'No matches';
      }

      case 'grep': {
        const pattern = input.pattern as string;
        const path = (input.path as string) || '.';
        const result = execFileSync('grep', ['-rn', pattern, path], { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        return result.split('\n').slice(0, 50).join('\n') || 'No matches';
      }

      case 'list_dir': {
        const p = (input.path as string) || '.';
        if (!existsSync(p)) return `Error: Path not found: ${p}`;
        return readdirSync(p).map(f => {
          const stat = statSync(`${p}/${f}`);
          return `${stat.isDirectory() ? 'd' : '-'} ${f}`;
        }).join('\n');
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// === AGENT LOOP ===
const client = new Anthropic();
const messages: Anthropic.MessageParam[] = [];

const SYSTEM = `You are an expert coding assistant. You have tools for reading, writing, editing files, running commands, and searching code. Be concise. Use tools to accomplish tasks.`;

async function chat(userMessage: string): Promise<string> {
  messages.push({ role: 'user', content: userMessage });

  let response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: SYSTEM,
    tools,
    messages,
  });

  // Agent loop: keep going while there are tool calls
  while (response.stop_reason === 'tool_use') {
    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type === 'tool_use') {
        console.log(`\x1b[33m⚡ ${block.name}\x1b[0m`);
        const result = executeTool(block.name, block.input as Record<string, unknown>);
        console.log(`\x1b[90m${result.slice(0, 200)}${result.length > 200 ? '...' : ''}\x1b[0m`);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } else if (block.type === 'text' && block.text) {
        process.stdout.write(block.text);
      }
    }

    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: SYSTEM,
      tools,
      messages,
    });
  }

  // Extract final text
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  messages.push({ role: 'assistant', content: response.content });
  return text;
}

// === CLI ===
async function main() {
  // Check API key early
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  // Single prompt mode
  if (args.length > 0) {
    const result = await chat(args.join(' '));
    console.log(result);
    return;
  }

  // Interactive mode
  console.log('\x1b[34mnano-opencode\x1b[0m - type your message, /quit to exit\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => rl.question('\x1b[32m❯\x1b[0m ', async (input) => {
    if (input.trim() === '/quit' || input.trim() === '/exit') {
      rl.close();
      return;
    }
    if (!input.trim()) {
      prompt();
      return;
    }
    try {
      const result = await chat(input);
      console.log(`\n\x1b[34m◆\x1b[0m ${result}\n`);
    } catch (e) {
      console.error(`\x1b[31mError: ${e instanceof Error ? e.message : e}\x1b[0m`);
    }
    prompt();
  });
  prompt();
}

main().catch(console.error);
