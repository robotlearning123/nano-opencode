/**
 * CLI Command handlers - extracted for simplicity
 */

import chalk from 'chalk';
import type { Session, AgentInstance } from './types.js';
import { createSession, getSession, listSessions, updateSessionTitle } from './store.js';
import { SUPPORTED_PROVIDERS, ENV_KEY_MAP, type SupportedProvider } from './constants.js';
import { setAuth, clearAuth, listAccounts, getAuthPath } from './auth.js';
import {
  listAuthProviders,
  addProviderAccount,
  loadProviderAuth,
  getAuthProvider,
} from './auth/providers.js';
import { createAgent, listAgents } from './agents/index.js';
import { initHooks, listHooks, enableHook, disableHook, toggleHook } from './hooks/index.js';
import { mcpRegistry } from './mcp/index.js';
import { listSkills, getSkill, getSkillDirectories } from './skills/index.js';
import { getAllTools } from './tools/index.js';
import {
  listMemoryFiles,
  saveToMemory,
  formatMemoryEntry,
  hasMemory,
  clearMemoryCache,
  loadMemoryContext,
} from './memory/index.js';

type PromptFn = () => Promise<string>;

export const commands = {
  help(): void {
    const cmds = [
      ['/help, /h', 'Show this help'],
      ['/quit, /q', 'Exit'],
      ['/clear, /c', 'Clear screen'],
      ['/new, /n', 'New session'],
      ['/sessions, /s', 'List sessions'],
      ['/load <id>', 'Load session'],
      ['/tools, /t', 'List tools'],
      ['/agent [name]', 'List/switch agents'],
      ['/hooks [cmd]', 'Manage hooks'],
      ['/connect [p]', 'Configure provider'],
      ['/auth status', 'Show auth status'],
      ['/mcp', 'List MCP servers'],
      ['/skill [name]', 'List/show skills'],
      ['/memory', 'Show active memory files'],
      ['/remember <text>', 'Save insight to memory'],
    ];
    console.log(chalk.cyan('\nCommands:'));
    for (const [cmd, desc] of cmds) {
      console.log(chalk.gray(`  ${cmd.padEnd(18)} ${desc}`));
    }
    console.log();
  },

  sessions(currentId: string): void {
    const sessions = listSessions(10);
    console.log(chalk.cyan('\nRecent sessions:'));
    if (!sessions.length) {
      console.log(chalk.gray('  No sessions yet.\n'));
      return;
    }
    for (const s of sessions) {
      const current = s.id === currentId ? chalk.green(' (current)') : '';
      console.log(chalk.gray(`  ${s.id.slice(0, 8)} - ${s.title}${current}`));
    }
    console.log();
  },

  loadSession(idPrefix: string): Session | null {
    const sessions = listSessions(100);
    const match = sessions.find(s => s.id.startsWith(idPrefix));
    if (match) {
      const full = getSession(match.id);
      if (full) {
        console.log(chalk.green(`\nLoaded: ${full.title}\n`));
        return full;
      }
    }
    console.log(chalk.red(`Session not found: ${idPrefix}\n`));
    return null;
  },

  tools(agent: AgentInstance): void {
    const allTools = getAllTools();
    const agentTools = agent.getTools(allTools);
    console.log(chalk.cyan(`\nTools for ${agent.definition.name}:`));
    for (const tool of agentTools) {
      const prefix = tool.name.startsWith('mcp_') ? chalk.blue('[MCP] ') : '';
      console.log(chalk.white(`  ${prefix}${tool.name}`));
    }
    const diff = allTools.length - agentTools.length;
    if (diff > 0) console.log(chalk.gray(`  (${diff} restricted)`));
    console.log();
  },

  agent(name: string | undefined, current: AgentInstance): AgentInstance | null {
    if (!name) {
      console.log(chalk.cyan('\nAgents:'));
      for (const a of listAgents()) {
        const mark = a.name === current.definition.name ? chalk.green(' ✓') : '';
        console.log(chalk.white(`  ${a.name}${mark}`));
        console.log(chalk.gray(`    ${a.description}`));
      }
      console.log();
      return null;
    }
    const newAgent = createAgent(name);
    if (!newAgent) {
      console.log(chalk.red(`Unknown agent: ${name}\n`));
      return null;
    }
    console.log(chalk.green(`\nSwitched to: ${name}\n`));
    return newAgent;
  },

  hooks(cmd?: string, name?: string): void {
    initHooks();
    if (!cmd) {
      console.log(chalk.cyan('\nHooks:'));
      for (const h of listHooks()) {
        const status = h.enabled ? chalk.green('✓') : chalk.gray('○');
        console.log(chalk.white(`  ${status} ${h.name}`));
      }
      console.log(chalk.gray('\nUsage: /hooks enable|disable|toggle <name>\n'));
      return;
    }
    if (!name) {
      console.log(chalk.red('Usage: /hooks enable|disable|toggle <name>\n'));
      return;
    }
    const actions: Record<string, () => boolean | undefined> = {
      enable: () => enableHook(name),
      disable: () => disableHook(name),
      toggle: () => toggleHook(name),
    };
    const action = actions[cmd.toLowerCase()];
    if (action) {
      const result = action();
      console.log(result !== undefined ? chalk.green(`\n${cmd}: ${name}\n`) : chalk.red(`\nHook not found: ${name}\n`));
    }
  },

  async connect(providerArg: string | undefined, promptFn: PromptFn): Promise<void> {
    // List all providers: API key + OAuth
    const oauthProviders = listAuthProviders();
    const allProviders = [
      ...SUPPORTED_PROVIDERS.map(p => ({ name: p, type: 'api' as const })),
      ...oauthProviders.map(p => ({ name: p.name, type: 'oauth' as const, provider: p })),
    ];

    let selection: typeof allProviders[0];

    if (providerArg) {
      const found = allProviders.find(p => p.name === providerArg);
      if (found) {
        selection = found;
      } else {
        console.log(chalk.red(`Unknown provider: ${providerArg}\n`));
        return;
      }
    } else {
      console.log(chalk.cyan('\nSelect provider:'));
      console.log(chalk.gray('\n  API Key Auth:'));
      SUPPORTED_PROVIDERS.forEach((p, i) => {
        console.log(chalk.white(`    ${i + 1}. ${p}`));
      });
      console.log(chalk.gray('\n  OAuth (use existing subscription):'));
      oauthProviders.forEach((p, i) => {
        const idx = SUPPORTED_PROVIDERS.length + i + 1;
        const stored = loadProviderAuth(p.name);
        const accounts = stored ? ` (${stored.tokens.length} accounts)` : '';
        console.log(chalk.white(`    ${idx}. ${p.displayName}${accounts}`));
        console.log(chalk.gray(`       ${p.description}`));
      });

      const choice = await promptFn();
      const idx = parseInt(choice.trim(), 10) - 1;

      if (idx >= 0 && idx < allProviders.length) {
        selection = allProviders[idx];
      } else {
        console.log(chalk.red('Invalid selection.\n'));
        return;
      }
    }

    // Handle OAuth providers
    if (selection.type === 'oauth') {
      console.log(chalk.cyan(`\nConnecting to ${selection.provider!.displayName}...`));
      const success = await addProviderAccount(selection.name);
      if (success) {
        console.log(chalk.green(`\n${selection.provider!.displayName} connected!\n`));
        console.log(chalk.gray('Available models:'));
        selection.provider!.models.forEach(m => console.log(chalk.white(`  ${m}`)));
        console.log();
      }
      return;
    }

    // Handle API key providers
    const provider = selection.name as SupportedProvider;
    console.log(chalk.cyan(`\nEnter API key for ${provider} (or Enter to use env):`));
    const apiKey = await promptFn();

    if (!apiKey.trim()) {
      const envKey = process.env[ENV_KEY_MAP[provider]];
      if (envKey) {
        setAuth(provider, { type: 'api', key: envKey });
        console.log(chalk.green(`\nUsing ${ENV_KEY_MAP[provider]} from environment.\n`));
      } else {
        console.log(chalk.yellow(`\nNo key provided.\n`));
      }
      return;
    }
    setAuth(provider, { type: 'api', key: apiKey.trim() });
    console.log(chalk.green(`\n${provider} configured! Stored in: ${getAuthPath()}\n`));
  },

  auth(args: string[]): void {
    const cmd = args[0]?.toLowerCase();
    if (cmd === 'status') {
      console.log(chalk.cyan('\nAuth Status:'));

      // API key providers
      console.log(chalk.gray('\n  API Key:'));
      const accounts = listAccounts();
      for (const p of SUPPORTED_PROVIDERS) {
        const hasEnv = !!process.env[ENV_KEY_MAP[p]];
        const hasAuth = accounts.some(a => a.provider === p);
        const status = hasEnv || hasAuth ? chalk.green('✓') : chalk.gray('○');
        console.log(`    ${status} ${p}`);
      }

      // OAuth providers
      console.log(chalk.gray('\n  OAuth:'));
      for (const p of listAuthProviders()) {
        const stored = loadProviderAuth(p.name);
        const count = stored?.tokens.length || 0;
        const status = count > 0 ? chalk.green('✓') : chalk.gray('○');
        const info = count > 0 ? ` (${count} account${count > 1 ? 's' : ''})` : '';
        console.log(`    ${status} ${p.displayName}${info}`);
      }
      console.log();
    } else if (cmd === 'logout') {
      const provider = args[1];
      if (provider) {
        clearAuth(provider);
        console.log(chalk.green(`\nCleared: ${provider}\n`));
      } else {
        SUPPORTED_PROVIDERS.forEach(p => clearAuth(p));
        console.log(chalk.green('\nCleared all auth.\n'));
      }
    } else {
      console.log(chalk.gray('\nUsage: /auth status | /auth logout [provider]\n'));
    }
  },

  mcp(): void {
    const servers = mcpRegistry.listServers();
    if (!servers.length) {
      console.log(chalk.cyan('\nNo MCP servers. Configure in config.json.\n'));
      return;
    }
    console.log(chalk.cyan('\nMCP Servers:'));
    for (const s of servers) {
      const status = s.connected ? chalk.green('●') : chalk.red('○');
      console.log(chalk.white(`  ${status} ${s.id} (${s.toolCount} tools)`));
    }
    console.log();
  },

  async skill(name?: string): Promise<void> {
    if (!name) {
      const skills = await listSkills();
      if (!skills.length) {
        console.log(chalk.cyan('\nNo skills found.'));
        console.log(chalk.gray(`Create .md files in: ${getSkillDirectories().join(', ')}\n`));
        return;
      }
      console.log(chalk.cyan('\nSkills:'));
      for (const s of skills) {
        console.log(chalk.white(`  ${s.name}`));
        if (s.frontmatter.description) {
          console.log(chalk.gray(`    ${s.frontmatter.description}`));
        }
      }
      console.log();
      return;
    }

    const skill = await getSkill(name);
    if (!skill) {
      console.log(chalk.red(`\nSkill not found: ${name}\n`));
      return;
    }
    console.log(chalk.cyan(`\n${skill.name}`));
    console.log(chalk.gray(skill.frontmatter.description || '(no description)'));
    console.log(chalk.dim('\n' + skill.content.slice(0, 300) + '...\n'));
  },

  memory(cmd?: string): void {
    if (cmd === 'refresh') {
      clearMemoryCache();
      console.log(chalk.green('\nMemory cache cleared.\n'));
      return;
    }

    const files = listMemoryFiles();
    if (!files.length) {
      console.log(chalk.cyan('\nNo memory files found.'));
      console.log(chalk.gray('Create NANO.md in:'));
      console.log(chalk.gray('  ~/.nano/NANO.md    (global preferences)'));
      console.log(chalk.gray('  ./NANO.md          (project context)\n'));
      return;
    }

    console.log(chalk.cyan('\nActive Memory Files:'));
    for (const f of files) {
      console.log(chalk.white(`  ${f}`));
    }

    // Show preview of combined context
    const context = loadMemoryContext();
    if (context.combined) {
      const preview = context.combined.slice(0, 500);
      console.log(chalk.dim('\nPreview:'));
      console.log(chalk.gray(preview + (context.combined.length > 500 ? '...' : '')));
    }
    console.log();
  },

  async remember(args: string[], promptFn: PromptFn): Promise<void> {
    const text = args.join(' ').trim();

    if (!text) {
      console.log(chalk.cyan('\nSave insight to memory:'));
      console.log(chalk.gray('  /remember <text>              Save to project NANO.md'));
      console.log(chalk.gray('  /remember --global <text>     Save to global ~/.nano/NANO.md'));
      console.log(chalk.gray('  /remember --category <cat>    Save with category header\n'));
      return;
    }

    // Parse flags
    let scope: 'global' | 'project' = 'project';
    let category: string | undefined;
    let content = text;

    if (text.startsWith('--global ')) {
      scope = 'global';
      content = text.slice('--global '.length).trim();
    }

    const catMatch = content.match(/^--category\s+(\S+)\s+/);
    if (catMatch) {
      category = catMatch[1];
      content = content.slice(catMatch[0].length).trim();
    }

    if (!content) {
      console.log(chalk.red('No content to save.\n'));
      return;
    }

    // Format and save
    const formatted = formatMemoryEntry(content, category);
    const result = saveToMemory(formatted, scope);

    if (result.success) {
      console.log(chalk.green(`\n${result.message}\n`));
    } else {
      console.log(chalk.red(`\n${result.message}\n`));
    }
  },
};
