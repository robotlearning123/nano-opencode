import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { hookRegistry } from '../src/hooks/registry.js';
import { executeHooks } from '../src/hooks/executor.js';
import type { Hook, HookResult, HookContext, HookLifecycle } from '../src/types.js';

const CONTINUE: HookResult = { continue: true };

function createTestHook(overrides: Partial<Hook> & { name: string }): Hook {
  return {
    lifecycle: 'chat.message.before' as HookLifecycle,
    handler: () => CONTINUE,
    ...overrides,
  };
}

describe('Hook System', () => {
  beforeEach(() => {
    hookRegistry.clear();
  });

  describe('Hook Registry', () => {
    it('register adds a hook', () => {
      hookRegistry.register(createTestHook({ name: 'test-hook' }));
      const retrieved = hookRegistry.get('test-hook');

      assert.ok(retrieved);
      assert.strictEqual(retrieved.name, 'test-hook');
    });

    it('unregister removes a hook', () => {
      hookRegistry.register(createTestHook({ name: 'test-hook' }));
      hookRegistry.unregister('test-hook');

      assert.strictEqual(hookRegistry.get('test-hook'), undefined);
    });

    it('enable enables a hook', () => {
      hookRegistry.register(createTestHook({ name: 'test-hook', enabled: false }));
      const result = hookRegistry.enable('test-hook');

      assert.strictEqual(result, true);
      assert.strictEqual(hookRegistry.get('test-hook')?.enabled, true);
    });

    it('disable disables a hook', () => {
      hookRegistry.register(createTestHook({ name: 'test-hook', enabled: true }));
      const result = hookRegistry.disable('test-hook');

      assert.strictEqual(result, true);
      assert.strictEqual(hookRegistry.get('test-hook')?.enabled, false);
    });

    it('getForLifecycle filters by lifecycle', () => {
      hookRegistry.register(createTestHook({ name: 'before-hook' }));
      hookRegistry.register(createTestHook({ name: 'after-hook', lifecycle: 'chat.message.after' }));

      const beforeHooks = hookRegistry.getForLifecycle('chat.message.before');
      assert.strictEqual(beforeHooks.length, 1);
      assert.strictEqual(beforeHooks[0].name, 'before-hook');
    });

    it('getForLifecycle excludes disabled hooks', () => {
      hookRegistry.register(createTestHook({ name: 'enabled-hook', enabled: true }));
      hookRegistry.register(createTestHook({ name: 'disabled-hook', enabled: false }));

      const hooks = hookRegistry.getForLifecycle('chat.message.before');
      assert.strictEqual(hooks.length, 1);
      assert.strictEqual(hooks[0].name, 'enabled-hook');
    });

    it('getForLifecycle sorts by priority', () => {
      hookRegistry.register(createTestHook({ name: 'low-priority', priority: 200 }));
      hookRegistry.register(createTestHook({ name: 'high-priority', priority: 50 }));

      const hooks = hookRegistry.getForLifecycle('chat.message.before');
      assert.strictEqual(hooks[0].name, 'high-priority');
      assert.strictEqual(hooks[1].name, 'low-priority');
    });
  });

  describe('Hook Executor', () => {
    it('executeHooks runs hooks in priority order', async () => {
      const order: string[] = [];

      hookRegistry.register(createTestHook({
        name: 'second',
        priority: 100,
        handler: () => { order.push('second'); return CONTINUE; },
      }));
      hookRegistry.register(createTestHook({
        name: 'first',
        priority: 50,
        handler: () => { order.push('first'); return CONTINUE; },
      }));

      await executeHooks('chat.message.before', {});
      assert.deepStrictEqual(order, ['first', 'second']);
    });

    it('executeHooks stops on continue: false', async () => {
      const order: string[] = [];

      hookRegistry.register(createTestHook({
        name: 'stopper',
        priority: 50,
        handler: () => { order.push('stopper'); return { continue: false }; },
      }));
      hookRegistry.register(createTestHook({
        name: 'never-runs',
        priority: 100,
        handler: () => { order.push('never-runs'); return CONTINUE; },
      }));

      const result = await executeHooks('chat.message.before', {});
      assert.strictEqual(result.continue, false);
      assert.deepStrictEqual(order, ['stopper']);
    });

    it('executeHooks handles async handlers', async () => {
      hookRegistry.register(createTestHook({
        name: 'async-hook',
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { continue: true, metadata: { async: true } };
        },
      }));

      const result = await executeHooks('chat.message.before', {});
      assert.strictEqual(result.continue, true);
      assert.strictEqual(result.metadata?.async, true);
    });

    it('executeHooks passes context correctly', async () => {
      let receivedContext: HookContext | undefined;

      hookRegistry.register(createTestHook({
        name: 'context-hook',
        handler: (ctx) => { receivedContext = ctx; return CONTINUE; },
      }));

      const message = { role: 'user' as const, content: 'Hello' };
      await executeHooks('chat.message.before', { message });

      assert.ok(receivedContext);
      assert.strictEqual(receivedContext.lifecycle, 'chat.message.before');
      assert.strictEqual(receivedContext.message?.content, 'Hello');
      assert.ok(receivedContext.timestamp > 0);
    });

    it('executeHooks returns default result when no hooks', async () => {
      const result = await executeHooks('chat.message.before', {});
      assert.strictEqual(result.continue, true);
    });
  });
});
