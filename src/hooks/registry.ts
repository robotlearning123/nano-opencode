/**
 * Hook Registry - manages hook registration and lifecycle
 */

import type { Hook, HookLifecycle } from '../types.js';

class HookRegistry {
  private hooks = new Map<string, Hook>();

  register(hook: Hook): void {
    this.hooks.set(hook.name, {
      ...hook,
      priority: hook.priority ?? 100,
      enabled: hook.enabled ?? true,
    });
  }

  unregister(name: string): void {
    this.hooks.delete(name);
  }

  get(name: string): Hook | undefined {
    return this.hooks.get(name);
  }

  enable(name: string): boolean {
    return this.setEnabled(name, true);
  }

  disable(name: string): boolean {
    return this.setEnabled(name, false);
  }

  toggle(name: string): boolean {
    const hook = this.hooks.get(name);
    if (!hook) return false;
    hook.enabled = !hook.enabled;
    return hook.enabled;
  }

  getForLifecycle(lifecycle: HookLifecycle): Hook[] {
    return Array.from(this.hooks.values())
      .filter((hook) => {
        if (!hook.enabled) return false;
        if (Array.isArray(hook.lifecycle)) return hook.lifecycle.includes(lifecycle);
        return hook.lifecycle === lifecycle;
      })
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  list(): Hook[] {
    return Array.from(this.hooks.values());
  }

  listEnabled(): Hook[] {
    return this.list().filter((h) => h.enabled);
  }

  listDisabled(): Hook[] {
    return this.list().filter((h) => !h.enabled);
  }

  clear(): void {
    this.hooks.clear();
  }

  private setEnabled(name: string, enabled: boolean): boolean {
    const hook = this.hooks.get(name);
    if (!hook) return false;
    hook.enabled = enabled;
    return true;
  }
}

export const hookRegistry = new HookRegistry();
