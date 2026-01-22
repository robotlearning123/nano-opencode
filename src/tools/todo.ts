/**
 * Todo Tools - task list management
 */

import type { Tool } from '../types.js';

interface TodoItem {
  id: number;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  completedAt?: Date;
}

// In-memory todo list (per session)
let todos: TodoItem[] = [];
let nextId = 1;

/**
 * Reset todos (for new session)
 */
export function resetTodos(): void {
  todos = [];
  nextId = 1;
}

/**
 * Get all todos
 */
export function getTodos(): TodoItem[] {
  return [...todos];
}

export const todoWriteTool: Tool = {
  name: 'todo_write',
  description: 'Create, update, or manage todo items. Use for task tracking.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action: add, update, remove, or clear',
        enum: ['add', 'update', 'remove', 'clear'],
      },
      content: {
        type: 'string',
        description: 'Todo content (for add action)',
      },
      id: {
        type: 'number',
        description: 'Todo ID (for update/remove actions)',
      },
      status: {
        type: 'string',
        description: 'New status (for update action)',
        enum: ['pending', 'in_progress', 'completed'],
      },
    },
    required: ['action'],
  },
  execute: async (args) => {
    const action = args.action as string;
    const content = args.content as string | undefined;
    const id = args.id as number | undefined;
    const status = args.status as TodoItem['status'] | undefined;

    switch (action) {
      case 'add': {
        if (!content) {
          return 'Error: content is required for add action';
        }
        const item: TodoItem = {
          id: nextId++,
          content,
          status: 'pending',
          createdAt: new Date(),
        };
        todos.push(item);
        return `Added todo #${item.id}: ${content}`;
      }

      case 'update': {
        if (id === undefined) {
          return 'Error: id is required for update action';
        }
        const todo = todos.find((t) => t.id === id);
        if (!todo) {
          return `Error: Todo #${id} not found`;
        }
        if (content) {
          todo.content = content;
        }
        if (status) {
          todo.status = status;
          if (status === 'completed') {
            todo.completedAt = new Date();
          }
        }
        return `Updated todo #${id}`;
      }

      case 'remove': {
        if (id === undefined) {
          return 'Error: id is required for remove action';
        }
        const index = todos.findIndex((t) => t.id === id);
        if (index === -1) {
          return `Error: Todo #${id} not found`;
        }
        todos.splice(index, 1);
        return `Removed todo #${id}`;
      }

      case 'clear': {
        const count = todos.length;
        todos = [];
        return `Cleared ${count} todos`;
      }

      default:
        return `Error: Unknown action: ${action}`;
    }
  },
};

export const todoReadTool: Tool = {
  name: 'todo_read',
  description: 'Read the current todo list',
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter by status',
        enum: ['all', 'pending', 'in_progress', 'completed'],
      },
    },
    required: [],
  },
  execute: async (args) => {
    const filter = (args.filter as string) || 'all';

    let filtered = todos;
    if (filter !== 'all') {
      filtered = todos.filter((t) => t.status === filter);
    }

    if (filtered.length === 0) {
      return filter === 'all' ? 'No todos.' : `No ${filter} todos.`;
    }

    const lines = filtered.map((t) => {
      const statusIcon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '→' : '○';
      return `${statusIcon} #${t.id} [${t.status}] ${t.content}`;
    });

    return lines.join('\n');
  },
};
