import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import type { Message, StreamChunk, LLMProvider, Session, AgentInstance, Tool } from './types.js';
import { getAllTools, executeTool } from './tools/index.js';
import { createSession, addMessage, getSession, listSessions, updateSessionTitle } from './store.js';
import { getErrorMessage, SUPPORTED_PROVIDERS, ENV_KEY_MAP, type SupportedProvider } from './constants.js';
import { setAuth, clearAuth, listAccounts, listProviderAccounts, getAuthPath } from './auth.js';
import { maskSensitiveValue } from './utils.js';
import { createAgent, listAgents, getDefaultAgent } from './agents/index.js';
import { initHooks, listHooks, enableHook, disableHook, toggleHook, beforeToolExecute, afterToolExecute } from './hooks/index.js';
import { mcpRegistry } from './mcp/index.js';
import { listSkills, getSkill, getSkillDirectories } from './skills/index.js';
import { banner, statusLine, prompt as uiPrompt, toolBox, formatMarkdown } from './ui/index.js';

export class CLI {
  private provider: LLMProvider;
  private session: Session;
  private rl: readline.Interface;
  private isRunning = false;
  private currentAgent: AgentInstance;
  private turnCount = 0;

  constructor(provider: LLMProvider, sessionId?: string) {
    this.provider = provider;
    const existing = sessionId ? getSession(sessionId) : null;
    this.session = existing ?? createSession();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    // Initialize with default agent (sisyphus)
    this.currentAgent = createAgent('sisyphus')!;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.printWelcome();

    while (this.isRunning) {
      const input = await this.prompt();

      if (!input.trim()) continue;

      if (input.startsWith('/')) {
        await this.handleCommand(input);
        continue;
      }

      await this.chat(input);
    }

    this.rl.close();
  }

  private printWelcome(): void {
    console.log(banner());
    console.log(statusLine(this.provider.name, this.currentAgent.definition.name, this.session.id));
    console.log(chalk.gray('\n  Type /help for commands\n'));
  }

  private async prompt(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(uiPrompt(), (answer) => {
        resolve(answer);
      });
    });
  }

  private async handleCommand(input: string): Promise<void> {
    const [cmd, ...args] = input.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
      case 'h':
        this.printHelp();
        break;
      case 'quit':
      case 'q':
      case 'exit':
        this.isRunning = false;
        console.log(chalk.gray('\nGoodbye!\n'));
        break;
      case 'clear':
      case 'c':
        console.clear();
        this.printWelcome();
        break;
      case 'new':
      case 'n':
        this.session = createSession();
        console.log(chalk.green(`\nNew session: ${this.session.id.slice(0, 8)}...\n`));
        break;
      case 'sessions':
      case 's':
        this.listSessions();
        break;
      case 'load':
      case 'l':
        if (args[0]) {
          await this.loadSession(args[0]);
        } else {
          console.log(chalk.red('Usage: /load <session-id>'));
        }
        break;
      case 'tools':
      case 't':
        this.listTools();
        break;
      case 'agent':
      case 'a':
        this.handleAgent(args[0]);
        break;
      case 'hooks':
        this.handleHooks(args[0], args[1]);
        break;
      case 'connect':
        await this.handleConnect(args[0]);
        break;
      case 'auth':
        await this.handleAuth(args);
        break;
      case 'mcp':
        this.handleMcp();
        break;
      case 'skill':
      case 'skills':
        await this.handleSkill(args[0]);
        break;
      default:
        console.log(chalk.red(`Unknown command: ${cmd}\n`));
    }
  }

  private printHelp(): void {
    console.log(chalk.cyan('\nCommands:'));
    console.log(chalk.gray('  /help, /h           Show this help'));
    console.log(chalk.gray('  /quit, /q           Exit the program'));
    console.log(chalk.gray('  /clear, /c          Clear the screen'));
    console.log(chalk.gray('  /new, /n            Start a new session'));
    console.log(chalk.gray('  /sessions, /s       List recent sessions'));
    console.log(chalk.gray('  /load <id>          Load a session'));
    console.log(chalk.gray('  /tools, /t          List available tools'));
    console.log(chalk.gray('  /agent, /a [name]   List agents or switch to agent'));
    console.log(chalk.gray('  /hooks [cmd] [name] List/enable/disable hooks'));
    console.log(chalk.cyan('\nAuth Commands:'));
    console.log(chalk.gray('  /connect [provider] Configure provider (anthropic, openai, gemini)'));
    console.log(chalk.gray('  /auth status        Show auth status for all providers'));
    console.log(chalk.gray('  /auth logout [provider] Clear auth for provider'));
    console.log(chalk.cyan('\nMCP Commands:'));
    console.log(chalk.gray('  /mcp                List connected MCP servers and tools'));
    console.log(chalk.cyan('\nSkill Commands:'));
    console.log(chalk.gray('  /skill              List available skills'));
    console.log(chalk.gray('  /skill <name>       Show skill details\n'));
  }

  private listSessions(): void {
    const sessions = listSessions(10);
    console.log(chalk.cyan('\nRecent sessions:'));
    if (sessions.length === 0) {
      console.log(chalk.gray('  No sessions yet.\n'));
      return;
    }
    for (const s of sessions) {
      const date = s.updatedAt.toLocaleDateString();
      const current = s.id === this.session.id ? chalk.green(' (current)') : '';
      console.log(chalk.gray(`  ${s.id.slice(0, 8)} - ${s.title} [${date}]${current}`));
    }
    console.log();
  }

  private async loadSession(idPrefix: string): Promise<void> {
    const sessions = listSessions(100);
    const match = sessions.find((s) => s.id.startsWith(idPrefix));

    if (match) {
      const full = getSession(match.id);
      if (full) {
        this.session = full;
        console.log(chalk.green(`\nLoaded session: ${this.session.title}\n`));
        return;
      }
    }

    console.log(chalk.red(`Session not found: ${idPrefix}\n`));
  }

  private listTools(): void {
    const allTools = getAllTools();
    const agentTools = this.currentAgent.getTools(allTools);
    console.log(chalk.cyan(`\nAvailable tools for ${this.currentAgent.definition.name}:`));
    for (const tool of agentTools) {
      const isMcp = tool.name.startsWith('mcp_');
      const prefix = isMcp ? chalk.blue('[MCP] ') : '';
      console.log(chalk.white(`  ${prefix}${tool.name}`));
      console.log(chalk.gray(`    ${tool.description}\n`));
    }
    if (agentTools.length < allTools.length) {
      console.log(chalk.gray(`  (${allTools.length - agentTools.length} tools restricted for this agent)\n`));
    }
  }

  private handleAgent(agentName?: string): void {
    if (!agentName) {
      // List all agents
      const agents = listAgents();
      console.log(chalk.cyan('\nAvailable agents:'));
      for (const agent of agents) {
        const current = agent.name === this.currentAgent.definition.name ? chalk.green(' (current)') : '';
        const category = agent.category ? chalk.gray(` [${agent.category}]`) : '';
        console.log(chalk.white(`  ${agent.name}${category}${current}`));
        console.log(chalk.gray(`    ${agent.description}`));
        if (agent.disallowedTools?.length) {
          console.log(chalk.gray(`    Restricted: ${agent.disallowedTools.join(', ')}`));
        }
        if (agent.allowedTools?.length) {
          console.log(chalk.gray(`    Only: ${agent.allowedTools.join(', ')}`));
        }
        console.log();
      }
      return;
    }

    // Switch to agent
    const newAgent = createAgent(agentName);
    if (!newAgent) {
      console.log(chalk.red(`\nUnknown agent: ${agentName}`));
      console.log(chalk.gray('Use /agent to list available agents.\n'));
      return;
    }

    this.currentAgent = newAgent;
    this.turnCount = 0;  // Reset turn count for new agent
    console.log(chalk.green(`\nSwitched to agent: ${agentName}`));
    console.log(chalk.gray(`  ${newAgent.definition.description}\n`));
  }

  private handleHooks(command?: string, hookName?: string): void {
    initHooks();

    if (!command) {
      // List all hooks
      const hooks = listHooks();
      console.log(chalk.cyan('\nRegistered hooks:'));
      for (const hook of hooks) {
        const status = hook.enabled ? chalk.green('enabled') : chalk.gray('disabled');
        const priority = chalk.gray(`[priority: ${hook.priority}]`);
        console.log(chalk.white(`  ${hook.name} - ${status} ${priority}`));
        if (hook.description) {
          console.log(chalk.gray(`    ${hook.description}`));
        }
        const lifecycles = Array.isArray(hook.lifecycle) ? hook.lifecycle.join(', ') : hook.lifecycle;
        console.log(chalk.gray(`    Lifecycle: ${lifecycles}\n`));
      }
      console.log(chalk.gray('Usage: /hooks enable|disable|toggle <name>\n'));
      return;
    }

    if (!hookName) {
      console.log(chalk.red('Usage: /hooks enable|disable|toggle <name>\n'));
      return;
    }

    switch (command.toLowerCase()) {
      case 'enable': {
        if (enableHook(hookName)) {
          console.log(chalk.green(`\nEnabled hook: ${hookName}\n`));
        } else {
          console.log(chalk.red(`\nHook not found: ${hookName}\n`));
        }
        break;
      }
      case 'disable': {
        if (disableHook(hookName)) {
          console.log(chalk.green(`\nDisabled hook: ${hookName}\n`));
        } else {
          console.log(chalk.red(`\nHook not found: ${hookName}\n`));
        }
        break;
      }
      case 'toggle': {
        const newState = toggleHook(hookName);
        console.log(chalk.green(`\nToggled hook ${hookName}: now ${newState ? 'enabled' : 'disabled'}\n`));
        break;
      }
      default:
        console.log(chalk.red('Usage: /hooks enable|disable|toggle <name>\n'));
    }
  }

  private async handleConnect(providerArg?: string): Promise<void> {
    let provider: SupportedProvider;

    if (providerArg) {
      // Validate provider
      if (!SUPPORTED_PROVIDERS.includes(providerArg as SupportedProvider)) {
        console.log(chalk.red(`\nUnknown provider: ${providerArg}`));
        console.log(chalk.gray(`Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}\n`));
        return;
      }
      provider = providerArg as SupportedProvider;
    } else {
      // Interactive provider selection
      console.log(chalk.cyan('\nSelect a provider:'));
      SUPPORTED_PROVIDERS.forEach((p, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${p}`));
      });

      const choice = await this.prompt();
      const index = parseInt(choice.trim(), 10) - 1;

      if (index >= 0 && index < SUPPORTED_PROVIDERS.length) {
        provider = SUPPORTED_PROVIDERS[index];
      } else if (SUPPORTED_PROVIDERS.includes(choice.trim() as SupportedProvider)) {
        provider = choice.trim() as SupportedProvider;
      } else {
        console.log(chalk.red('Invalid selection.\n'));
        return;
      }
    }

    // Prompt for API key
    console.log(chalk.cyan(`\nConfiguring ${provider}...`));
    console.log(chalk.gray(`Enter your API key (or press Enter to use ${ENV_KEY_MAP[provider]} env var):`));

    const apiKey = await this.prompt();

    if (!apiKey.trim()) {
      // Check env var
      const envKey = process.env[ENV_KEY_MAP[provider]];
      if (envKey) {
        console.log(chalk.green(`\nUsing ${ENV_KEY_MAP[provider]} from environment.`));
        setAuth(provider, { type: 'api', key: envKey });
        console.log(chalk.green(`${provider} configured successfully!\n`));
      } else {
        console.log(chalk.yellow(`\nNo API key provided and ${ENV_KEY_MAP[provider]} not set.\n`));
      }
      return;
    }

    // Save the API key
    setAuth(provider, { type: 'api', key: apiKey.trim() });
    console.log(chalk.green(`\n${provider} configured successfully!`));
    console.log(chalk.gray(`API key stored in: ${getAuthPath()}\n`));
  }

  private async handleAuth(args: string[]): Promise<void> {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case 'status': {
        console.log(chalk.cyan('\nAuth Status:'));
        const accounts = listAccounts();

        if (accounts.length === 0) {
          console.log(chalk.gray('  No accounts configured.'));
          console.log(chalk.gray('  Use /connect to set up a provider.\n'));
          return;
        }

        // Group by provider
        for (const provider of SUPPORTED_PROVIDERS) {
          const providerAccounts = accounts.filter(a => a.provider === provider);
          const envKey = ENV_KEY_MAP[provider];
          const hasEnv = !!process.env[envKey];

          console.log(chalk.white(`\n  ${provider}:`));

          if (hasEnv) {
            console.log(chalk.green(`    ✓ ${envKey} environment variable set`));
          }

          if (providerAccounts.length > 0) {
            for (const acc of providerAccounts) {
              const keyDisplay = acc.auth.key || '(oauth)';
              const emailDisplay = acc.email ? ` (${acc.email})` : '';
              console.log(chalk.green(`    ✓ ${keyDisplay}${emailDisplay}`));
            }
          } else if (!hasEnv) {
            console.log(chalk.gray('    Not configured'));
          }
        }
        console.log();
        break;
      }

      case 'logout': {
        const provider = args[1]?.toLowerCase();

        if (provider) {
          if (!SUPPORTED_PROVIDERS.includes(provider as SupportedProvider)) {
            console.log(chalk.red(`\nUnknown provider: ${provider}\n`));
            return;
          }
          clearAuth(provider);
          console.log(chalk.green(`\nCleared auth for ${provider}.\n`));
        } else {
          // Clear all
          for (const p of SUPPORTED_PROVIDERS) {
            clearAuth(p);
          }
          console.log(chalk.green('\nCleared all auth.\n'));
        }
        break;
      }

      default:
        console.log(chalk.red('\nUsage:'));
        console.log(chalk.gray('  /auth status        Show auth status'));
        console.log(chalk.gray('  /auth logout [provider] Clear auth\n'));
    }
  }

  private handleMcp(): void {
    const servers = mcpRegistry.listServers();

    if (servers.length === 0) {
      console.log(chalk.cyan('\nNo MCP servers connected.'));
      console.log(chalk.gray('Configure MCP servers in config.json:\n'));
      console.log(chalk.gray('  {'));
      console.log(chalk.gray('    "mcp": {'));
      console.log(chalk.gray('      "servers": {'));
      console.log(chalk.gray('        "context7": {'));
      console.log(chalk.gray('          "command": "npx",'));
      console.log(chalk.gray('          "args": ["-y", "@context7/mcp-server"]'));
      console.log(chalk.gray('        }'));
      console.log(chalk.gray('      }'));
      console.log(chalk.gray('    }'));
      console.log(chalk.gray('  }\n'));
      return;
    }

    console.log(chalk.cyan('\nMCP Servers:'));
    for (const server of servers) {
      const status = server.connected ? chalk.green('connected') : chalk.red('disconnected');
      console.log(chalk.white(`\n  ${server.id} - ${status}`));
      console.log(chalk.gray(`    Tools: ${server.toolCount}`));

      // List tools from this server
      const client = mcpRegistry.getClient(server.id);
      if (client) {
        const tools = client.getCachedTools();
        for (const tool of tools) {
          console.log(chalk.gray(`      - ${tool.name}: ${tool.description || '(no description)'}`));
        }
      }
    }
    console.log();
  }

  private async handleSkill(skillName?: string): Promise<void> {
    if (!skillName) {
      // List all skills
      const skills = await listSkills();

      if (skills.length === 0) {
        console.log(chalk.cyan('\nNo skills found.'));
        const dirs = getSkillDirectories();
        console.log(chalk.gray('Create skill files (.md) in:'));
        for (const dir of dirs) {
          console.log(chalk.gray(`  - ${dir}`));
        }
        console.log(chalk.gray('\nExample skill file:'));
        console.log(chalk.gray('  ---'));
        console.log(chalk.gray('  description: My custom skill'));
        console.log(chalk.gray('  tags: [coding, helper]'));
        console.log(chalk.gray('  ---'));
        console.log(chalk.gray('  # My Skill'));
        console.log(chalk.gray('  Instructions for the agent...\n'));
        return;
      }

      console.log(chalk.cyan('\nAvailable skills:'));
      for (const skill of skills) {
        const tags = skill.frontmatter.tags?.length
          ? chalk.gray(` [${skill.frontmatter.tags.join(', ')}]`)
          : '';
        const agent = skill.frontmatter.agent ? chalk.blue(' (agent)') : '';
        console.log(chalk.white(`\n  ${skill.name}${agent}${tags}`));
        console.log(chalk.gray(`    ${skill.frontmatter.description || '(no description)'}`));
      }
      console.log();
      return;
    }

    // Show specific skill details
    const skill = await getSkill(skillName);
    if (!skill) {
      console.log(chalk.red(`\nSkill not found: ${skillName}`));
      console.log(chalk.gray('Use /skill to list available skills.\n'));
      return;
    }

    console.log(chalk.cyan(`\nSkill: ${skill.name}`));
    console.log(chalk.gray(`Path: ${skill.path}`));
    console.log(chalk.white(`\nDescription: ${skill.frontmatter.description || '(none)'}`));

    if (skill.frontmatter.tags?.length) {
      console.log(chalk.gray(`Tags: ${skill.frontmatter.tags.join(', ')}`));
    }
    if (skill.frontmatter.model) {
      console.log(chalk.gray(`Model: ${skill.frontmatter.model}`));
    }
    if (skill.frontmatter.agent) {
      console.log(chalk.blue('Mode: Agent (spawns as sub-agent)'));
    }

    console.log(chalk.white('\n--- Content Preview ---'));
    const preview = skill.content.slice(0, 500);
    console.log(chalk.gray(preview));
    if (skill.content.length > 500) {
      console.log(chalk.gray(`\n... (${skill.content.length - 500} more characters)`));
    }
    console.log();
  }

  private async chat(userInput: string): Promise<void> {
    // Add user message
    const userMessage: Message = { role: 'user', content: userInput };
    this.session.messages.push(userMessage);
    addMessage(this.session.id, userMessage);

    // Process with potential tool use loop
    await this.processWithToolLoop();

    // Update session title based on first message
    if (this.session.messages.length === 2) {
      const title = userInput.slice(0, 50) + (userInput.length > 50 ? '...' : '');
      updateSessionTitle(this.session.id, title);
      this.session.title = title;
    }
  }

  private async processWithToolLoop(): Promise<void> {
    // Check max turns limit
    const maxTurns = this.currentAgent.definition.maxTurns ?? 50;
    if (this.turnCount >= maxTurns) {
      console.log(chalk.yellow(`\nMax turns (${maxTurns}) reached for agent ${this.currentAgent.definition.name}.`));
      console.log(chalk.gray('Use /agent to switch agents or /new to start fresh.\n'));
      return;
    }
    this.turnCount++;

    const spinner = ora({ text: 'Thinking...', spinner: 'dots' }).start();
    let output = '';

    // Get agent-specific tools and system prompt (includes MCP tools)
    const allTools = getAllTools();
    const agentTools = this.currentAgent.getTools(allTools);
    const systemPrompt = this.currentAgent.getSystemPrompt();

    try {
      const assistantMessage = await this.provider.chat(
        this.session.messages,
        agentTools,
        (chunk: StreamChunk) => {
          if (chunk.type === 'text' && chunk.content) {
            if (spinner.isSpinning) {
              spinner.stop();
              console.log(chalk.blue.bold('\n◆ Assistant'));
              console.log(chalk.dim('─'.repeat(50)));
            }
            process.stdout.write(chalk.white(chunk.content));
            output += chunk.content;
          } else if (chunk.type === 'tool_use' && chunk.toolCall) {
            if (spinner.isSpinning) {
              spinner.stop();
            }
            console.log(chalk.yellow(`\n⚡ Using: ${chunk.toolCall.name}`));
          }
        },
        systemPrompt
      );

      if (spinner.isSpinning) {
        spinner.stop();
      }

      if (output) {
        console.log('\n' + chalk.dim('─'.repeat(50)) + '\n');
      }

      // Save assistant message
      this.session.messages.push(assistantMessage);
      addMessage(this.session.id, assistantMessage);

      // Handle tool calls
      if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
        const toolResults: Message['toolResults'] = [];

        for (const toolCall of assistantMessage.toolCalls) {
          const result = await executeTool(toolCall.name, toolCall.arguments);

          // Display with beautiful formatting
          console.log(toolBox(toolCall.name, result));

          toolResults.push({
            toolCallId: toolCall.id,
            content: result,
          });
        }

        // Add tool results as user message
        const toolResultMessage: Message = {
          role: 'user',
          content: '',
          toolResults,
        };
        this.session.messages.push(toolResultMessage);
        addMessage(this.session.id, toolResultMessage);

        // Continue the conversation
        await this.processWithToolLoop();
      }
    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`\nError: ${getErrorMessage(error)}\n`));
    }
  }
}
