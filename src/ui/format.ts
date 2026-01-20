/**
 * UI Formatting - beautiful output with minimal code
 */

import chalk from 'chalk';

// Box drawing characters
const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  ltee: '├', rtee: '┤',
};

/**
 * Create a box around content
 */
export function box(title: string, content: string, color = chalk.cyan): string {
  const lines = content.split('\n');
  const maxLen = Math.max(title.length + 2, ...lines.map(l => stripAnsi(l).length));
  const width = Math.min(maxLen, process.stdout.columns - 4 || 76);

  const top = color(`${BOX.tl}─ ${title} ${'─'.repeat(Math.max(0, width - title.length - 3))}${BOX.tr}`);
  const bot = color(`${BOX.bl}${'─'.repeat(width + 2)}${BOX.br}`);

  const body = lines.map(line => {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, width - stripped.length);
    return color(BOX.v) + ' ' + line + ' '.repeat(pad) + ' ' + color(BOX.v);
  }).join('\n');

  return `${top}\n${body}\n${bot}`;
}

/**
 * Format tool call output
 */
export function toolBox(name: string, output: string): string {
  const icon = getToolIcon(name);
  const truncated = truncateOutput(output, 50);
  return box(`${icon} ${name}`, chalk.gray(truncated), chalk.yellow);
}

/**
 * Format assistant message
 */
export function assistantBox(content: string): string {
  return box('◆ Assistant', formatMarkdown(content), chalk.blue);
}

/**
 * Format error message
 */
export function errorBox(message: string): string {
  return box('✗ Error', chalk.red(message), chalk.red);
}

/**
 * Format success message
 */
export function successBox(message: string): string {
  return box('✓ Success', chalk.green(message), chalk.green);
}

/**
 * Simple markdown formatting
 */
export function formatMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return chalk.dim('─'.repeat(40)) + '\n' + chalk.cyan(code.trim()) + '\n' + chalk.dim('─'.repeat(40));
    })
    // Inline code
    .replace(/`([^`]+)`/g, chalk.cyan('$1'))
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, chalk.bold('$1'))
    // Headers
    .replace(/^### (.+)$/gm, chalk.bold.yellow('   $1'))
    .replace(/^## (.+)$/gm, chalk.bold.cyan('  $1'))
    .replace(/^# (.+)$/gm, chalk.bold.white(' $1'))
    // Lists
    .replace(/^[-*] (.+)$/gm, chalk.gray('  • ') + '$1')
    .replace(/^\d+\. (.+)$/gm, (_, item) => chalk.gray('  → ') + item);
}

/**
 * Get icon for tool
 */
function getToolIcon(name: string): string {
  const icons: Record<string, string> = {
    read_file: '📄', write_file: '✏️', edit_file: '📝',
    bash: '⚡', glob: '🔍', grep: '🔎', list_dir: '📁',
    todo_write: '✓', todo_read: '📋',
    lsp_definition: '🎯', lsp_references: '🔗', lsp_hover: '💡',
    diff: '±', patch: '🩹', webfetch: '🌐',
    background_task: '⏳', background_output: '📤',
    session_list: '📚', skill_execute: '🎭',
  };
  return icons[name] || '🔧';
}

/**
 * Truncate long output
 */
function truncateOutput(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;

  const half = Math.floor(maxLines / 2);
  const top = lines.slice(0, half);
  const bot = lines.slice(-half);
  const omitted = lines.length - maxLines;

  return [...top, chalk.dim(`  ... (${omitted} lines omitted) ...`), ...bot].join('\n');
}

/**
 * Strip ANSI codes for length calculation
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Status line
 */
export function statusLine(provider: string, agent: string, session: string): string {
  return chalk.dim('─'.repeat(60)) + '\n' +
    chalk.gray(`  ${chalk.cyan('●')} ${provider} │ ${chalk.yellow('◆')} ${agent} │ ${chalk.blue('◇')} ${session.slice(0, 8)}`) + '\n' +
    chalk.dim('─'.repeat(60));
}

/**
 * Welcome banner
 */
export function banner(): string {
  return `
${chalk.cyan.bold('  ╭─────────────────────────────────╮')}
${chalk.cyan.bold('  │')}  ${chalk.white.bold('nano')} ${chalk.gray('- AI coding assistant')}   ${chalk.cyan.bold('│')}
${chalk.cyan.bold('  ╰─────────────────────────────────╯')}
`;
}

/**
 * Prompt indicator
 */
export function prompt(): string {
  return chalk.green.bold('❯ ');
}

/**
 * Thinking indicator
 */
export function thinking(): string {
  return chalk.yellow('◐ ') + chalk.gray('Thinking...');
}
