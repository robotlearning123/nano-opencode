import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import type {
  Message,
  StreamChunk,
  LLMProvider,
  Session,
  AgentInstance,
  ToolCall,
} from './types.js';
import { getAllTools, executeTool } from './tools/index.js';
import { createSession, addMessage, updateSessionTitle, getSession } from './store.js';
import { getErrorMessage } from './constants.js';
import { createAgent } from './agents/index.js';
import { banner, statusLine, prompt as uiPrompt, toolBox } from './ui/index.js';
import { commands } from './commands.js';
import {
  initHooks,
  beforeToolExecute,
  afterToolExecute,
  onSessionStart,
  afterChatMessage,
} from './hooks/index.js';

export class CLI {
  private provider: LLMProvider;
  private session: Session;
  private rl: readline.Interface;
  private isRunning = false;
  private agent: AgentInstance;
  private turns = 0;
  private currentOperation: AbortController | null = null;

  constructor(provider: LLMProvider, sessionId?: string, existingSession?: Session) {
    this.provider = provider;
    // Restore session by ID, use existing session, or create new
    this.session = existingSession ?? (sessionId ? getSession(sessionId) : null) ?? createSession();
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    this.agent = createAgent('sisyphus')!;

    // Initialize hooks
    initHooks();

    // SIGINT handler for Ctrl+C
    process.on('SIGINT', () => {
      if (this.currentOperation) {
        this.currentOperation.abort();
        this.currentOperation = null;
        console.log(chalk.yellow('\n⚠️ Operation cancelled'));
      } else {
        console.log(chalk.gray('\nGoodbye!\n'));
        this.rl.close();
        process.exit(0);
      }
    });
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(banner());
    console.log(statusLine(this.provider.name, this.agent.definition.name, this.session.id));
    console.log(chalk.gray('\n  Type /help for commands\n'));

    // Execute session.start hooks
    await onSessionStart(this.session, this.agent);

    while (this.isRunning) {
      const input = await this.prompt();
      if (!input.trim()) continue;
      if (input.startsWith('/')) {
        await this.handleCommand(input);
      } else {
        await this.chat(input);
      }
    }
    this.rl.close();
  }

  private prompt = (): Promise<string> =>
    new Promise((resolve) => this.rl.question(uiPrompt(), resolve));

  private async handleCommand(input: string): Promise<void> {
    const [cmd, ...args] = input.slice(1).split(' ');
    const c = cmd.toLowerCase();

    if (c === 'help' || c === 'h') commands.help();
    else if (c === 'quit' || c === 'q' || c === 'exit') {
      this.isRunning = false;
      console.log(chalk.gray('\nGoodbye!\n'));
    } else if (c === 'clear' || c === 'c') {
      console.clear();
      console.log(banner());
      console.log(statusLine(this.provider.name, this.agent.definition.name, this.session.id));
    } else if (c === 'new' || c === 'n') {
      this.session = createSession();
      console.log(chalk.green(`\nNew session: ${this.session.id.slice(0, 8)}\n`));
    } else if (c === 'sessions' || c === 's') commands.sessions(this.session.id);
    else if (c === 'load' || c === 'l') {
      if (args[0]) {
        const s = commands.loadSession(args[0]);
        if (s) this.session = s;
      } else console.log(chalk.red('Usage: /load <id>'));
    } else if (c === 'tools' || c === 't') commands.tools(this.agent);
    else if (c === 'agent' || c === 'a') {
      const newAgent = commands.agent(args[0], this.agent);
      if (newAgent) {
        this.agent = newAgent;
        this.turns = 0;
      }
    } else if (c === 'hooks') commands.hooks(args[0], args[1]);
    else if (c === 'connect') await commands.connect(args[0], this.prompt);
    else if (c === 'auth') commands.auth(args);
    else if (c === 'mcp') commands.mcp();
    else if (c === 'skill' || c === 'skills') await commands.skill(args[0]);
    else if (c === 'memory' || c === 'mem') commands.memory(args[0]);
    else if (c === 'remember' || c === 'rem') await commands.remember(args, this.prompt);
    else console.log(chalk.red(`Unknown: ${cmd}\n`));
  }

  private async chat(userInput: string): Promise<void> {
    const userMsg: Message = { role: 'user', content: userInput };
    this.session.messages.push(userMsg);
    addMessage(this.session.id, userMsg);
    await this.processLoop();
    if (this.session.messages.length === 2) {
      const title = userInput.slice(0, 50) + (userInput.length > 50 ? '...' : '');
      updateSessionTitle(this.session.id, title);
      this.session.title = title;
    }
  }

  private async processLoop(): Promise<void> {
    const maxTurns = this.agent.definition.maxTurns ?? 50;
    if (this.turns >= maxTurns) {
      console.log(chalk.yellow(`\nMax turns (${maxTurns}) reached.\n`));
      return;
    }
    this.turns++;

    // Create AbortController for this operation
    this.currentOperation = new AbortController();
    const spinner = ora({ text: 'Thinking...', spinner: 'dots' }).start();
    let output = '';
    const tools = this.agent.getTools(getAllTools());
    const systemPrompt = this.agent.getSystemPrompt();

    try {
      // Check if operation was aborted
      if (this.currentOperation.signal.aborted) {
        spinner.stop();
        return;
      }

      const response = await this.provider.chat(
        this.session.messages,
        tools,
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
            if (spinner.isSpinning) spinner.stop();
            console.log(chalk.yellow(`\n⚡ ${chunk.toolCall.name}`));
          }
        },
        systemPrompt
      );

      if (spinner.isSpinning) spinner.stop();
      if (output) console.log('\n' + chalk.dim('─'.repeat(50)) + '\n');

      // Execute chat.message.after hooks
      await afterChatMessage(response, this.session, this.agent);

      this.session.messages.push(response);
      addMessage(this.session.id, response);

      if (response.toolCalls?.length) {
        const toolResults: Message['toolResults'] = [];
        for (const tc of response.toolCalls) {
          // Check if operation was aborted
          if (this.currentOperation?.signal.aborted) {
            console.log(chalk.yellow('⚠️ Remaining tools skipped'));
            break;
          }

          // Execute tool.execute.before hooks (safety check)
          const toolCall: ToolCall = { id: tc.id, name: tc.name, arguments: tc.arguments };
          const beforeResult = await beforeToolExecute(toolCall, this.session, this.agent);
          if (!beforeResult.continue) {
            const blockedMsg = `Tool ${tc.name} blocked by safety hook`;
            console.log(chalk.red(`\n⛔ ${blockedMsg}\n`));
            toolResults.push({ toolCallId: tc.id, content: blockedMsg, isError: true });
            continue;
          }

          // Execute the tool
          const result = await executeTool(tc.name, tc.arguments);
          console.log(toolBox(tc.name, result));

          // Execute tool.execute.after hooks (may truncate output)
          const afterResult = await afterToolExecute(
            toolCall,
            { toolCallId: tc.id, content: result },
            this.session,
            this.agent
          );
          const finalContent = afterResult.modified?.toolResult?.content ?? result;
          toolResults.push({ toolCallId: tc.id, content: finalContent });
        }
        const resultMsg: Message = { role: 'user', content: '', toolResults };
        this.session.messages.push(resultMsg);
        addMessage(this.session.id, resultMsg);

        // Continue loop if not aborted
        if (!this.currentOperation?.signal.aborted) {
          await this.processLoop();
        }
      }
    } catch (error) {
      spinner.stop();
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(chalk.yellow('\n⚠️ Operation cancelled\n'));
      } else {
        console.log(chalk.red(`\nError: ${getErrorMessage(error)}\n`));
      }
    } finally {
      this.currentOperation = null;
    }
  }
}
