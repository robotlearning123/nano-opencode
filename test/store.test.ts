import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  createSession,
  getSession,
  listSessions,
  addMessage,
  updateSessionTitle,
  deleteSession,
  closeDb,
} from '../src/store.js';
import type { Message } from '../src/types.js';

describe('Session Store', () => {
  let sessionId: string;

  after(() => {
    // Cleanup
    if (sessionId) {
      try {
        deleteSession(sessionId);
      } catch {
        // Ignore errors
      }
    }
    closeDb();
  });

  it('should create a new session', () => {
    const session = createSession('Test Session');

    assert.ok(session.id);
    assert.strictEqual(session.title, 'Test Session');
    assert.strictEqual(session.messages.length, 0);

    sessionId = session.id;
  });

  it('should retrieve a session', () => {
    const session = getSession(sessionId);

    assert.ok(session);
    assert.strictEqual(session?.id, sessionId);
    assert.strictEqual(session?.title, 'Test Session');
  });

  it('should add messages to a session', () => {
    const message: Message = {
      role: 'user',
      content: 'Hello, world!',
    };

    addMessage(sessionId, message);

    const session = getSession(sessionId);
    assert.strictEqual(session?.messages.length, 1);
    assert.strictEqual(session?.messages[0].role, 'user');
    assert.strictEqual(session?.messages[0].content, 'Hello, world!');
  });

  it('should add assistant message with tool calls', () => {
    const message: Message = {
      role: 'assistant',
      content: 'Let me read that file.',
      toolCalls: [
        {
          id: 'call_123',
          name: 'read_file',
          arguments: { path: 'test.txt' },
        },
      ],
    };

    addMessage(sessionId, message);

    const session = getSession(sessionId);
    assert.strictEqual(session?.messages.length, 2);
    assert.strictEqual(session?.messages[1].role, 'assistant');
    assert.ok(session?.messages[1].toolCalls);
    assert.strictEqual(session?.messages[1].toolCalls?.[0].name, 'read_file');
  });

  it('should update session title', () => {
    updateSessionTitle(sessionId, 'Updated Title');

    const session = getSession(sessionId);
    assert.strictEqual(session?.title, 'Updated Title');
  });

  it('should list sessions', () => {
    const sessions = listSessions(10);

    assert.ok(sessions.length > 0);
    assert.ok(sessions.some((s) => s.id === sessionId));
  });

  it('should delete a session', () => {
    deleteSession(sessionId);

    const session = getSession(sessionId);
    assert.strictEqual(session, null);

    // Clear sessionId so cleanup doesn't fail
    sessionId = '';
  });
});
