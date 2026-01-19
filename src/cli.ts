import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import type { Message, StreamChunk, LLMProvider, Session } from './types.js';
import { allTools, executeTool } from './tools/index.js';
import { createSession, addMessage, getSession, listSessions, updateSessionTitle } from './store.js';

export class CLI {
  private provider: LLMProvider;
  private session: Session;
  private rl: readline.Interface;
  private isRunning = false;

  constructor(provider: LLMProvider, sessionId?: string) {
    this.provider = provider;
    const existing = sessionId ? getSession(sessionId) : null;
    this.session = existing ?? createSession();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
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
    console.log(chalk.cyan.bold('\n  nano-opencode'));
    console.log(chalk.gray('  A minimal AI coding assistant\n'));
    console.log(chalk.gray(`  Provider: ${this.provider.name}`));
    console.log(chalk.gray(`  Session: ${this.session.id.slice(0, 8)}...`));
    console.log(chalk.gray('  Type /help for commands\n'));
  }

  private async prompt(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(chalk.green('> '), (answer) => {
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
      default:
        console.log(chalk.red(`Unknown command: ${cmd}\n`));
    }
  }

  private printHelp(): void {
    console.log(chalk.cyan('\nCommands:'));
    console.log(chalk.gray('  /help, /h      Show this help'));
    console.log(chalk.gray('  /quit, /q      Exit the program'));
    console.log(chalk.gray('  /clear, /c     Clear the screen'));
    console.log(chalk.gray('  /new, /n       Start a new session'));
    console.log(chalk.gray('  /sessions, /s  List recent sessions'));
    console.log(chalk.gray('  /load <id>     Load a session'));
    console.log(chalk.gray('  /tools, /t     List available tools\n'));
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
    console.log(chalk.cyan('\nAvailable tools:'));
    for (const tool of allTools) {
      console.log(chalk.white(`  ${tool.name}`));
      console.log(chalk.gray(`    ${tool.description}\n`));
    }
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
    const spinner = ora({ text: 'Thinking...', spinner: 'dots' }).start();
    let output = '';

    try {
      const assistantMessage = await this.provider.chat(
        this.session.messages,
        allTools,
        (chunk: StreamChunk) => {
          if (chunk.type === 'text' && chunk.content) {
            if (spinner.isSpinning) {
              spinner.stop();
              console.log();
            }
            process.stdout.write(chalk.white(chunk.content));
            output += chunk.content;
          } else if (chunk.type === 'tool_use' && chunk.toolCall) {
            if (spinner.isSpinning) {
              spinner.stop();
              console.log();
            }
            console.log(chalk.yellow(`\n[Tool: ${chunk.toolCall.name}]`));
          }
        }
      );

      if (spinner.isSpinning) {
        spinner.stop();
      }

      if (output) {
        console.log('\n');
      }

      // Save assistant message
      this.session.messages.push(assistantMessage);
      addMessage(this.session.id, assistantMessage);

      // Handle tool calls
      if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
        const toolResults: Message['toolResults'] = [];

        for (const toolCall of assistantMessage.toolCalls) {
          console.log(chalk.gray(`  Executing ${toolCall.name}...`));
          const result = await executeTool(toolCall.name, toolCall.arguments);

          // Truncate long results for display
          const displayResult =
            result.length > 500
              ? result.slice(0, 500) + `\n... (${result.length - 500} more characters)`
              : result;
          console.log(chalk.gray(`  ${displayResult.split('\n').join('\n  ')}\n`));

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
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`\nError: ${message}\n`));
    }
  }
}
