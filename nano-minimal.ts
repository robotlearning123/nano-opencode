#!/usr/bin/env bun
/**
 * nano-opencode minimal: Zero-dependency AI agent (~150 LOC)
 * Works with Node.js 18+, Bun, Deno - any device with fetch
 *
 * Usage: ANTHROPIC_API_KEY=sk-... bun nano-minimal.ts "read package.json"
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { execFileSync } from 'child_process';

// === CONFIG ===
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.MODEL || 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';

// === TOOLS ===
const TOOLS = [
  { name: 'read_file', description: 'Read file', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'write_file', description: 'Write file', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: 'Edit file', input_schema: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] } },
  { name: 'bash', description: 'Run command', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
  { name: 'list_dir', description: 'List directory', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
];

// === TOOL EXECUTION ===
function run(name: string, i: Record<string, string>): string {
  try {
    if (name === 'read_file') return existsSync(i.path) ? readFileSync(i.path, 'utf-8') : 'File not found';
    if (name === 'write_file') { writeFileSync(i.path, i.content); return 'OK'; }
    if (name === 'edit_file') {
      const c = readFileSync(i.path, 'utf-8');
      if (!c.includes(i.old_string)) return 'old_string not found';
      writeFileSync(i.path, c.replace(i.old_string, i.new_string));
      return 'OK';
    }
    if (name === 'bash') return execFileSync('sh', ['-c', i.command], { encoding: 'utf-8', timeout: 30000 }).slice(0, 50000);
    if (name === 'list_dir') return readdirSync(i.path || '.').map(f => `${statSync(`${i.path || '.'}/${f}`).isDirectory() ? 'd' : '-'} ${f}`).join('\n');
    return 'Unknown tool';
  } catch (e) { return `Error: ${e}`; }
}

// === API CALL ===
interface Message { role: 'user' | 'assistant'; content: unknown }
interface Block { type: string; id?: string; name?: string; input?: Record<string, string>; text?: string }

async function call(messages: Message[]): Promise<{ content: Block[]; stop_reason: string }> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8192, tools: TOOLS, messages, system: 'You are a coding assistant. Use tools to help.' }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
  return res.json();
}

// === AGENT LOOP ===
async function agent(prompt: string): Promise<string> {
  const messages: Message[] = [{ role: 'user', content: prompt }];

  while (true) {
    const res = await call(messages);
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      return res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    }

    const results = res.content.filter(b => b.type === 'tool_use').map(b => {
      console.log(`⚡ ${b.name}`);
      const r = run(b.name!, b.input!);
      console.log(r.slice(0, 100) + (r.length > 100 ? '...' : ''));
      return { type: 'tool_result', tool_use_id: b.id, content: r };
    });

    messages.push({ role: 'user', content: results });
  }
}

// === MAIN ===
const prompt = process.argv.slice(2).join(' ');
if (!prompt) { console.log('Usage: bun nano-minimal.ts "your prompt"'); process.exit(1); }
if (!API_KEY) { console.log('Set ANTHROPIC_API_KEY'); process.exit(1); }

agent(prompt).then(console.log).catch(e => console.error('Error:', e));
