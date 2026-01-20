/**
 * Background Task Tools - manage long-running commands
 */

import type { Tool } from '../types.js';
import { backgroundManager } from '../background.js';

export const backgroundTaskTool: Tool = {
  name: 'background_task',
  description: 'Start a command in the background. Returns task ID immediately.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to run in background',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 600000 = 10 min)',
      },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const command = args.command as string;
    const timeout = (args.timeout as number) || 600000;

    const id = backgroundManager.start(command, timeout);
    return `Background task started: ${id}\nCommand: ${command}\nUse background_output to check results.`;
  },
};

export const backgroundOutputTool: Tool = {
  name: 'background_output',
  description: 'Get the output of a background task',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Task ID (e.g., bg_1)',
      },
    },
    required: ['id'],
  },
  execute: async (args) => {
    const id = args.id as string;
    const task = backgroundManager.getStatus(id);

    if (!task) {
      return `Error: Task ${id} not found`;
    }

    const duration = task.completedAt
      ? `${task.completedAt.getTime() - task.startedAt.getTime()}ms`
      : `${Date.now() - task.startedAt.getTime()}ms (running)`;

    let result = `Task: ${task.id}\n`;
    result += `Status: ${task.status}\n`;
    result += `Duration: ${duration}\n`;
    if (task.exitCode !== undefined) {
      result += `Exit code: ${task.exitCode}\n`;
    }
    result += `\nOutput:\n${task.output || '(no output yet)'}`;

    return result;
  },
};

export const backgroundCancelTool: Tool = {
  name: 'background_cancel',
  description: 'Cancel a running background task',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Task ID to cancel',
      },
    },
    required: ['id'],
  },
  execute: async (args) => {
    const id = args.id as string;
    const success = backgroundManager.cancel(id);

    if (success) {
      return `Task ${id} cancelled`;
    } else {
      const task = backgroundManager.getStatus(id);
      if (!task) {
        return `Error: Task ${id} not found`;
      }
      return `Cannot cancel task ${id}: status is ${task.status}`;
    }
  },
};

export const backgroundListTool: Tool = {
  name: 'background_list',
  description: 'List all background tasks',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => {
    const tasks = backgroundManager.list();

    if (tasks.length === 0) {
      return 'No background tasks.';
    }

    const lines = tasks.map(task => {
      const status = task.status === 'running' ? '🔄' : task.status === 'completed' ? '✓' : task.status === 'cancelled' ? '⏹' : '✗';
      const duration = task.completedAt
        ? `${task.completedAt.getTime() - task.startedAt.getTime()}ms`
        : `${Date.now() - task.startedAt.getTime()}ms`;
      return `${status} ${task.id} [${task.status}] (${duration}): ${task.command.slice(0, 50)}${task.command.length > 50 ? '...' : ''}`;
    });

    return lines.join('\n');
  },
};
