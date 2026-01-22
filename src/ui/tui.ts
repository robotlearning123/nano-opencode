/**
 * nano-opencode Minimal TUI
 *
 * A simple terminal UI using raw ANSI escape codes.
 * No external dependencies - just Node.js readline and process.stdout.
 *
 * ~150 LOC to stay true to nano-opencode's minimalist philosophy.
 */

import * as readline from 'readline'

// ANSI escape codes
const ESC = '\x1b['
const CLEAR = `${ESC}2J${ESC}H`
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`
const DIM = `${ESC}2m`
const BLUE = `${ESC}34m`
const GREEN = `${ESC}32m`
const YELLOW = `${ESC}33m`
const CYAN = `${ESC}36m`
const GRAY = `${ESC}90m`
const WHITE = `${ESC}37m`
const HIDE_CURSOR = `${ESC}?25l`
const SHOW_CURSOR = `${ESC}?25h`

export interface TuiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp?: number
}

export interface TuiOptions {
  title?: string
  model?: string
  onSubmit: (input: string) => Promise<void>
  onExit?: () => void
}

export class Tui {
  private messages: TuiMessage[] = []
  private rl: readline.Interface
  private isProcessing = false
  private spinnerFrame = 0
  private spinnerInterval?: NodeJS.Timeout
  private opts: TuiOptions
  private width = process.stdout.columns || 80
  private height = process.stdout.rows || 24

  private static SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  private static LOGO = `${CYAN}${BOLD}nano${RESET}${WHITE}-opencode${RESET}`

  constructor(opts: TuiOptions) {
    this.opts = opts
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    })

    process.stdout.on('resize', () => {
      this.width = process.stdout.columns || 80
      this.height = process.stdout.rows || 24
      this.render()
    })
  }

  private clear() {
    process.stdout.write(CLEAR)
  }

  private moveTo(row: number, col: number) {
    process.stdout.write(`${ESC}${row};${col}H`)
  }

  private renderHeader() {
    const model = this.opts.model || 'default'
    const title = this.opts.title || process.cwd().split('/').pop()
    const header = `${Tui.LOGO} ${DIM}│${RESET} ${YELLOW}${title}${RESET} ${DIM}│${RESET} ${GREEN}${model}${RESET}`
    const line = `${DIM}${'─'.repeat(this.width)}${RESET}`

    this.moveTo(1, 1)
    process.stdout.write(header)
    this.moveTo(2, 1)
    process.stdout.write(line)
  }

  private renderMessages() {
    const maxLines = this.height - 6 // header(2) + input(3) + padding(1)
    const startRow = 3

    // Get last N messages that fit
    let lines: string[] = []
    for (const msg of this.messages.slice(-20)) {
      const prefix = msg.role === 'user' ? `${BLUE}>${RESET} `
                   : msg.role === 'assistant' ? `${GREEN}◆${RESET} `
                   : msg.role === 'tool' ? `${YELLOW}⚙${RESET} `
                   : `${GRAY}•${RESET} `

      // Wrap long lines
      const wrapped = this.wrapText(msg.content, this.width - 4)
      lines.push(...wrapped.map((line, i) => i === 0 ? prefix + line : '  ' + line))
    }

    // Take only what fits
    lines = lines.slice(-maxLines)

    for (let i = 0; i < lines.length; i++) {
      this.moveTo(startRow + i, 1)
      process.stdout.write(lines[i].substring(0, this.width))
      process.stdout.write(`${ESC}K`) // Clear to end of line
    }
  }

  private renderInput() {
    const inputRow = this.height - 2
    const line = `${DIM}${'─'.repeat(this.width)}${RESET}`

    this.moveTo(inputRow - 1, 1)
    process.stdout.write(line)
    this.moveTo(inputRow, 1)

    if (this.isProcessing) {
      const spinner = Tui.SPINNER[this.spinnerFrame % Tui.SPINNER.length]
      process.stdout.write(`${CYAN}${spinner}${RESET} ${DIM}Processing...${RESET}${ESC}K`)
    } else {
      process.stdout.write(`${CYAN}>${RESET} ${ESC}K`)
    }
  }

  private renderFooter() {
    this.moveTo(this.height, 1)
    process.stdout.write(`${DIM}ctrl+c: exit${RESET}${ESC}K`)
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = []
    for (const paragraph of text.split('\n')) {
      if (paragraph.length <= maxWidth) {
        lines.push(paragraph)
      } else {
        let remaining = paragraph
        while (remaining.length > maxWidth) {
          let breakPoint = remaining.lastIndexOf(' ', maxWidth)
          if (breakPoint === -1) breakPoint = maxWidth
          lines.push(remaining.substring(0, breakPoint))
          remaining = remaining.substring(breakPoint + 1)
        }
        if (remaining) lines.push(remaining)
      }
    }
    return lines
  }

  render() {
    this.clear()
    this.renderHeader()
    this.renderMessages()
    this.renderInput()
    this.renderFooter()
  }

  addMessage(msg: TuiMessage) {
    this.messages.push({ ...msg, timestamp: Date.now() })
    this.render()
  }

  updateLastMessage(content: string) {
    if (this.messages.length > 0) {
      this.messages[this.messages.length - 1].content = content
      this.render()
    }
  }

  setProcessing(processing: boolean) {
    this.isProcessing = processing
    if (processing) {
      this.spinnerInterval = setInterval(() => {
        this.spinnerFrame++
        this.renderInput()
      }, 80)
    } else {
      if (this.spinnerInterval) clearInterval(this.spinnerInterval)
    }
    this.render()
  }

  async prompt(): Promise<string> {
    return new Promise((resolve) => {
      this.moveTo(this.height - 2, 4)
      process.stdout.write(SHOW_CURSOR)
      this.rl.question('', (answer) => {
        resolve(answer)
      })
    })
  }

  async run() {
    this.render()

    while (true) {
      const input = await this.prompt()

      if (input.toLowerCase() === '/exit' || input.toLowerCase() === '/quit') {
        break
      }

      if (!input.trim()) continue

      this.addMessage({ role: 'user', content: input })
      this.setProcessing(true)

      try {
        await this.opts.onSubmit(input)
      } catch (err) {
        this.addMessage({ role: 'system', content: `Error: ${err}` })
      }

      this.setProcessing(false)
    }

    this.close()
  }

  close() {
    process.stdout.write(SHOW_CURSOR)
    this.clear()
    this.rl.close()
    this.opts.onExit?.()
  }
}

// Export a simple factory function
export function createTui(opts: TuiOptions): Tui {
  return new Tui(opts)
}
