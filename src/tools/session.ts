/**
 * Session Tools - manage conversation sessions
 */

import type { Tool } from '../types.js';
import { listSessions as dbListSessions, getSession as dbGetSession } from '../store.js';

export const sessionListTool: Tool = {
  name: 'session_list',
  description: 'List recent conversation sessions',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of sessions to return (default: 10)',
      },
    },
    required: [],
  },
  execute: async (args) => {
    const limit = (args.limit as number) || 10;
    const sessions = dbListSessions(limit);

    if (sessions.length === 0) {
      return 'No sessions found.';
    }

    const lines = sessions.map((s) => {
      const date = s.updatedAt.toLocaleDateString();
      const time = s.updatedAt.toLocaleTimeString();
      return `${s.id.slice(0, 8)} - ${s.title} [${date} ${time}]`;
    });

    return `Sessions (${sessions.length}):\n${lines.join('\n')}`;
  },
};

export const sessionReadTool: Tool = {
  name: 'session_read',
  description: 'Read messages from a session',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID (or prefix)',
      },
      limit: {
        type: 'number',
        description: 'Maximum messages to return (default: all)',
      },
    },
    required: ['sessionId'],
  },
  execute: async (args) => {
    const sessionId = args.sessionId as string;
    const limit = args.limit as number | undefined;

    // Find session by prefix
    const sessions = dbListSessions(100);
    const match = sessions.find((s) => s.id.startsWith(sessionId));

    if (!match) {
      return `Session not found: ${sessionId}`;
    }

    const session = dbGetSession(match.id);
    if (!session) {
      return `Failed to load session: ${match.id}`;
    }

    let messages = session.messages;
    if (limit && limit > 0) {
      messages = messages.slice(-limit);
    }

    if (messages.length === 0) {
      return `Session ${session.id.slice(0, 8)} has no messages.`;
    }

    const lines: string[] = [
      `Session: ${session.title}`,
      `ID: ${session.id}`,
      `Messages: ${messages.length}`,
      '',
    ];

    for (const msg of messages) {
      const role = msg.role.toUpperCase();
      const content = msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '');
      lines.push(`[${role}] ${content}`);

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          lines.push(`  → Tool: ${tc.name}`);
        }
      }
    }

    return lines.join('\n');
  },
};

export const sessionSearchTool: Tool = {
  name: 'session_search',
  description: 'Search for sessions containing specific text',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Text to search for in session titles and messages',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 10)',
      },
    },
    required: ['query'],
  },
  execute: async (args) => {
    const query = (args.query as string).toLowerCase();
    const limit = (args.limit as number) || 10;

    const sessions = dbListSessions(100);
    const matches: { session: (typeof sessions)[0]; matchIn: string }[] = [];

    for (const s of sessions) {
      // Check title
      if (s.title.toLowerCase().includes(query)) {
        matches.push({ session: s, matchIn: 'title' });
        continue;
      }

      // Check messages
      const full = dbGetSession(s.id);
      if (full) {
        for (const msg of full.messages) {
          if (msg.content.toLowerCase().includes(query)) {
            matches.push({ session: s, matchIn: `message (${msg.role})` });
            break;
          }
        }
      }

      if (matches.length >= limit) break;
    }

    if (matches.length === 0) {
      return `No sessions found matching: ${query}`;
    }

    const lines = matches.slice(0, limit).map((m) => {
      const date = m.session.updatedAt.toLocaleDateString();
      return `${m.session.id.slice(0, 8)} - ${m.session.title} [${date}] (match: ${m.matchIn})`;
    });

    return `Found ${matches.length} sessions:\n${lines.join('\n')}`;
  },
};
