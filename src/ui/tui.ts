/**
 * nano-opencode Minimal TUI
 *
 * A simple terminal UI using raw ANSI escape codes.
 * No external dependencies - just Node.js readline and process.stdout.
 *
 * ~150 LOC to stay true to nano-opencode's minimalist philosophy.
 */

import * as readline from 'readline';
import path from 'node:path';

// ANSI escape codes
const ESC = '\x1b[';
const CLEAR = `${ESC}2J${ESC}H`;
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const ITALIC = `${ESC}3m`;
const UNDERLINE = `${ESC}4m`;
const BLUE = `${ESC}34m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const CYAN = `${ESC}36m`;
const MAGENTA = `${ESC}35m`;
const GRAY = `${ESC}90m`;
const WHITE = `${ESC}37m`;
const BG_GRAY = `${ESC}48;5;236m`;
const SHOW_CURSOR = `${ESC}?25h`;

// Syntax highlighting colors
const SYN_KEYWORD = `${ESC}38;5;198m`;
const SYN_STRING = `${ESC}38;5;113m`;
const SYN_COMMENT = `${ESC}38;5;245m`;
const SYN_NUMBER = `${ESC}38;5;141m`;
const SYN_FUNCTION = `${ESC}38;5;81m`;

// Simple inline markdown formatting
function formatInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, `${BG_GRAY}${CYAN}$1${RESET}`) // inline code
    .replace(/\*\*([^*]+)\*\*/g, `${BOLD}$1${RESET}`) // bold
    .replace(/\*([^*]+)\*/g, `${ITALIC}$1${RESET}`) // italic
    .replace(/_([^_]+)_/g, `${ITALIC}$1${RESET}`); // italic alt
}

// Basic syntax highlighting for code
function highlightCode(line: string): string {
  const keywords =
    /\b(const|let|var|function|class|if|else|return|import|export|from|async|await|for|while|try|catch|throw|new|this|true|false|null|undefined|def|self|print|elif|pass|lambda|with|as|yield|raise|except|finally|in|not|and|or|is|None|True|False)\b/g;
  return line
    .replace(keywords, `${SYN_KEYWORD}$1${RESET}`)
    .replace(/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g, `${SYN_STRING}$&${RESET}`)
    .replace(/\/\/.*$/g, `${SYN_COMMENT}$&${RESET}`)
    .replace(/#.*$/g, `${SYN_COMMENT}$&${RESET}`)
    .replace(/\b(\d+\.?\d*)\b/g, `${SYN_NUMBER}$1${RESET}`);
}

export interface TuiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
}

export interface TuiOptions {
  title?: string;
  model?: string;
  onSubmit: (input: string) => Promise<void>;
  onExit?: () => void;
}

export class Tui {
  private messages: TuiMessage[] = [];
  private rl: readline.Interface;
  private isProcessing = false;
  private spinnerFrame = 0;
  private spinnerInterval?: NodeJS.Timeout;
  private opts: TuiOptions;
  private width = process.stdout.columns || 80;
  private height = process.stdout.rows || 24;
  private closed = false;

  private static SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private static LOGO = `${CYAN}${BOLD}nano${RESET}${WHITE}-opencode${RESET}`;

  constructor(opts: TuiOptions) {
    this.opts = opts;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    this.rl.on('close', () => {
      this.closed = true;
    });

    process.stdout.on('resize', () => {
      this.width = process.stdout.columns || 80;
      this.height = process.stdout.rows || 24;
      this.render();
    });
  }

  private clear() {
    process.stdout.write(CLEAR);
  }

  private moveTo(row: number, col: number) {
    process.stdout.write(`${ESC}${row};${col}H`);
  }

  private renderHeader() {
    const model = this.opts.model || 'default';
    const title = this.opts.title || path.basename(process.cwd());
    const header = `${Tui.LOGO} ${DIM}│${RESET} ${YELLOW}${title}${RESET} ${DIM}│${RESET} ${GREEN}${model}${RESET}`;
    const line = `${DIM}${'─'.repeat(this.width)}${RESET}`;

    this.moveTo(1, 1);
    process.stdout.write(header);
    this.moveTo(2, 1);
    process.stdout.write(line);
  }

  private renderMessages() {
    const maxLines = this.height - 6; // header(2) + input(3) + padding(1)
    const startRow = 3;

    // Get messages (scroll support - no arbitrary limit)
    let lines: string[] = [];
    let inCodeBlock = false;

    for (const msg of this.messages) {
      const prefix =
        msg.role === 'user'
          ? `${BLUE}>${RESET} `
          : msg.role === 'assistant'
            ? `${GREEN}◆${RESET} `
            : msg.role === 'tool'
              ? `${YELLOW}⚙${RESET} `
              : `${GRAY}•${RESET} `;

      // Process content with markdown for assistant
      const contentLines = msg.content.split('\n');
      for (let j = 0; j < contentLines.length; j++) {
        let line = contentLines[j];

        // Code block handling
        if (line.startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          line = `${DIM}${line}${RESET}`;
        } else if (inCodeBlock) {
          line = `  ${BG_GRAY}${highlightCode(line)}${RESET}`;
        } else if (msg.role === 'assistant') {
          // Headers
          if (line.startsWith('### ')) line = `${BOLD}${CYAN}${line.slice(4)}${RESET}`;
          else if (line.startsWith('## ')) line = `${BOLD}${YELLOW}${line.slice(3)}${RESET}`;
          else if (line.startsWith('# ')) line = `${BOLD}${MAGENTA}${line.slice(2)}${RESET}`;
          // Lists
          else if (line.match(/^[-*] /)) line = `${CYAN}•${RESET} ${formatInline(line.slice(2))}`;
          else if (line.match(/^\d+\. /))
            line = `${CYAN}${line.match(/^\d+/)?.[0]}.${RESET} ${formatInline(line.replace(/^\d+\. /, ''))}`;
          else line = formatInline(line);
        }

        // Wrap and add prefix
        const wrapped = this.wrapText(line, this.width - 4);
        lines.push(...wrapped.map((l, i) => (j === 0 && i === 0 ? prefix + l : '  ' + l)));
      }
    }

    // Take only what fits (scroll to bottom)
    lines = lines.slice(-maxLines);

    for (let i = 0; i < lines.length; i++) {
      this.moveTo(startRow + i, 1);
      process.stdout.write(lines[i].substring(0, this.width));
      process.stdout.write(`${ESC}K`); // Clear to end of line
    }
  }

  private renderInput() {
    const inputRow = this.height - 2;
    const line = `${DIM}${'─'.repeat(this.width)}${RESET}`;

    this.moveTo(inputRow - 1, 1);
    process.stdout.write(line);
    this.moveTo(inputRow, 1);

    if (this.isProcessing) {
      const spinner = Tui.SPINNER[this.spinnerFrame % Tui.SPINNER.length];
      process.stdout.write(`${CYAN}${spinner}${RESET} ${DIM}Processing...${RESET}${ESC}K`);
    } else {
      process.stdout.write(`${CYAN}>${RESET} ${ESC}K`);
    }
  }

  private renderFooter() {
    this.moveTo(this.height, 1);
    process.stdout.write(`${DIM}/clear: reset │ /exit: quit │ ctrl+c: force quit${RESET}${ESC}K`);
  }

  clearMessages() {
    this.messages = [];
    this.render();
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (paragraph.length <= maxWidth) {
        lines.push(paragraph);
      } else {
        let remaining = paragraph;
        while (remaining.length > maxWidth) {
          let breakPoint = remaining.lastIndexOf(' ', maxWidth);
          if (breakPoint === -1) breakPoint = maxWidth;
          lines.push(remaining.substring(0, breakPoint));
          remaining = remaining.substring(breakPoint + 1);
        }
        if (remaining) lines.push(remaining);
      }
    }
    return lines;
  }

  render() {
    this.clear();
    this.renderHeader();
    this.renderMessages();
    this.renderInput();
    this.renderFooter();
  }

  addMessage(msg: TuiMessage) {
    this.messages.push({ ...msg, timestamp: Date.now() });
    this.render();
  }

  updateLastMessage(content: string) {
    if (this.messages.length > 0) {
      this.messages[this.messages.length - 1].content = content;
      this.render();
    }
  }

  setProcessing(processing: boolean) {
    this.isProcessing = processing;
    if (processing) {
      this.spinnerInterval = setInterval(() => {
        this.spinnerFrame++;
        this.renderInput();
      }, 80);
    } else {
      if (this.spinnerInterval) clearInterval(this.spinnerInterval);
    }
    this.render();
  }

  async prompt(): Promise<string> {
    if (this.closed) return '/exit';
    return new Promise((resolve) => {
      this.moveTo(this.height - 2, 4);
      process.stdout.write(SHOW_CURSOR);
      const onClose = () => resolve('/exit');
      this.rl.once('close', onClose);
      this.rl.question('', (answer) => {
        this.rl.removeListener('close', onClose);
        resolve(answer);
      });
    });
  }

  async run() {
    this.render();

    while (true) {
      const input = await this.prompt();

      if (input.toLowerCase() === '/exit' || input.toLowerCase() === '/quit') {
        break;
      }

      if (input.toLowerCase() === '/clear') {
        this.clearMessages();
        continue;
      }

      if (!input.trim()) continue;

      this.addMessage({ role: 'user', content: input });
      this.setProcessing(true);

      try {
        await this.opts.onSubmit(input);
      } catch (err) {
        this.addMessage({ role: 'system', content: `Error: ${err}` });
      }

      this.setProcessing(false);
    }

    this.close();
  }

  close() {
    if (this.spinnerInterval) clearInterval(this.spinnerInterval);
    process.stdout.write(SHOW_CURSOR);
    this.clear();
    this.rl.close();
    this.opts.onExit?.();
  }
}

// Export a simple factory function
export function createTui(opts: TuiOptions): Tui {
  return new Tui(opts);
}
