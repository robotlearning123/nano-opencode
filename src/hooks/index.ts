/**
 * Hook System - exports and initialization
 */

import { hookRegistry } from './registry.js';
import {
  builtInHooks,
  loggingHook,
  timingHook,
  safetyHook,
  truncatorHook,
  contextWindowHook,
  setMaxOutputSize,
  getMaxOutputSize,
  setWarningThreshold,
  getStats,
  resetStats,
  getTimingStats,
} from './builtin.js';

let initialized = false;

export function initHooks(): void {
  if (initialized) return;
  for (const hook of builtInHooks) {
    hookRegistry.register(hook);
  }
  initialized = true;
}

export function enableHook(name: string): boolean {
  initHooks();
  return hookRegistry.enable(name);
}

export function disableHook(name: string): boolean {
  initHooks();
  return hookRegistry.disable(name);
}

export function toggleHook(name: string): boolean {
  initHooks();
  return hookRegistry.toggle(name);
}

export function listHooks() {
  initHooks();
  return hookRegistry.list();
}

// Re-export registry
export { hookRegistry } from './registry.js';

// Re-export executor functions
export {
  executeHooks,
  beforeChatMessage,
  afterChatMessage,
  beforeToolExecute,
  afterToolExecute,
  onSessionStart,
  onSessionEnd,
} from './executor.js';

// Re-export built-in hooks and utilities
export {
  loggingHook,
  timingHook,
  safetyHook,
  truncatorHook,
  contextWindowHook,
  setMaxOutputSize,
  getMaxOutputSize,
  setWarningThreshold,
  getStats as getContextStats,
  resetStats as resetContextStats,
  getTimingStats,
};
