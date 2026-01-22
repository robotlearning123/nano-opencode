/**
 * Auth storage system for nano-opencode
 * Based on OpenCode authentication patterns with multi-account support
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Auth storage path
const AUTH_DIR = join(homedir(), '.config', 'nano-opencode');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');

/**
 * Authentication entry - supports both API keys and OAuth tokens
 */
export interface AuthEntry {
  type: 'api' | 'oauth';
  key?: string; // For API key auth
  access?: string; // For OAuth access token
  refresh?: string; // For OAuth refresh token
  expiry?: number; // Token expiry timestamp (ms)
}

/**
 * Account information - supports multiple accounts per provider
 */
export interface AuthAccount {
  id: string; // Unique account identifier
  email?: string; // Optional email for identification
  provider: string; // Provider name (anthropic, openai, etc.)
  auth: AuthEntry; // Authentication credentials
  lastUsed?: number; // Last used timestamp
  rateLimited?: boolean; // Whether account is currently rate-limited
}

/**
 * Auth storage structure
 */
interface AuthStorage {
  accounts: AuthAccount[];
  activeAccounts: Record<string, string>; // provider -> accountId mapping
}

/**
 * Generate a unique account ID
 */
function generateAccountId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Load auth storage from disk
 */
function loadAuthStorage(): AuthStorage {
  if (!existsSync(AUTH_FILE)) {
    return { accounts: [], activeAccounts: {} };
  }

  try {
    const content = readFileSync(AUTH_FILE, 'utf-8');
    return JSON.parse(content) as AuthStorage;
  } catch {
    console.error('Warning: Failed to parse auth file, starting fresh');
    return { accounts: [], activeAccounts: {} };
  }
}

/**
 * Save auth storage to disk
 */
function saveAuthStorage(storage: AuthStorage): void {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }
  writeFileSync(AUTH_FILE, JSON.stringify(storage, null, 2), { mode: 0o600 });
}

/**
 * Get the active auth entry for a provider
 * Returns undefined if no auth is configured
 */
export function getAuth(provider: string): AuthEntry | undefined {
  const storage = loadAuthStorage();
  const activeAccountId = storage.activeAccounts[provider];

  if (activeAccountId) {
    const account = storage.accounts.find(
      (a) => a.id === activeAccountId && a.provider === provider
    );
    if (account) {
      // Update last used timestamp
      account.lastUsed = Date.now();
      saveAuthStorage(storage);
      return account.auth;
    }
  }

  // Fallback: return first non-rate-limited account for provider
  const account = storage.accounts.find((a) => a.provider === provider && !a.rateLimited);
  if (account) {
    storage.activeAccounts[provider] = account.id;
    account.lastUsed = Date.now();
    saveAuthStorage(storage);
    return account.auth;
  }

  return undefined;
}

/**
 * Set auth for a provider (creates or updates account)
 */
export function setAuth(provider: string, entry: AuthEntry, email?: string): string {
  const storage = loadAuthStorage();

  // Check if account with same email exists
  let account = email
    ? storage.accounts.find((a) => a.provider === provider && a.email === email)
    : undefined;

  if (account) {
    // Update existing account
    account.auth = entry;
    account.lastUsed = Date.now();
    account.rateLimited = false;
  } else {
    // Create new account
    account = {
      id: generateAccountId(),
      email,
      provider,
      auth: entry,
      lastUsed: Date.now(),
      rateLimited: false,
    };
    storage.accounts.push(account);
  }

  // Set as active account for provider
  storage.activeAccounts[provider] = account.id;
  saveAuthStorage(storage);

  return account.id;
}

/**
 * Clear auth for a provider (removes all accounts)
 */
export function clearAuth(provider: string): void {
  const storage = loadAuthStorage();
  storage.accounts = storage.accounts.filter((a) => a.provider !== provider);
  delete storage.activeAccounts[provider];
  saveAuthStorage(storage);
}

/**
 * Clear a specific account
 */
export function clearAccount(accountId: string): boolean {
  const storage = loadAuthStorage();
  const account = storage.accounts.find((a) => a.id === accountId);

  if (!account) return false;

  storage.accounts = storage.accounts.filter((a) => a.id !== accountId);

  // Clear active account if it was the one removed
  if (storage.activeAccounts[account.provider] === accountId) {
    delete storage.activeAccounts[account.provider];
  }

  saveAuthStorage(storage);
  return true;
}

/**
 * List all accounts
 */
export function listAccounts(): AuthAccount[] {
  const storage = loadAuthStorage();
  // Return accounts without sensitive auth data
  return storage.accounts.map((a) => ({
    ...a,
    auth: {
      type: a.auth.type,
      // Mask key/access tokens
      key: a.auth.key ? `${a.auth.key.substring(0, 8)}...` : undefined,
      access: a.auth.access ? '(set)' : undefined,
    },
  }));
}

/**
 * List accounts for a specific provider
 */
export function listProviderAccounts(provider: string): AuthAccount[] {
  return listAccounts().filter((a) => a.provider === provider);
}

/**
 * Rotate to next available account for rate-limit handling
 * Marks current account as rate-limited and returns next available
 */
export function rotateAccount(provider: string): AuthEntry | undefined {
  const storage = loadAuthStorage();
  const currentId = storage.activeAccounts[provider];

  // Mark current account as rate-limited
  if (currentId) {
    const currentAccount = storage.accounts.find((a) => a.id === currentId);
    if (currentAccount) {
      currentAccount.rateLimited = true;
    }
  }

  // Find next non-rate-limited account
  const nextAccount = storage.accounts.find(
    (a) => a.provider === provider && !a.rateLimited && a.id !== currentId
  );

  if (nextAccount) {
    storage.activeAccounts[provider] = nextAccount.id;
    nextAccount.lastUsed = Date.now();
    saveAuthStorage(storage);
    return nextAccount.auth;
  }

  // No more accounts available, reset rate limits and try again
  for (const account of storage.accounts) {
    if (account.provider === provider) {
      account.rateLimited = false;
    }
  }

  const resetAccount = storage.accounts.find((a) => a.provider === provider);
  if (resetAccount) {
    storage.activeAccounts[provider] = resetAccount.id;
    resetAccount.lastUsed = Date.now();
    saveAuthStorage(storage);
    return resetAccount.auth;
  }

  return undefined;
}

/**
 * Check if auth is valid (not expired for OAuth)
 */
export function isAuthValid(entry: AuthEntry): boolean {
  if (entry.type === 'api') {
    return !!entry.key;
  }

  if (entry.type === 'oauth') {
    if (!entry.access) return false;
    if (entry.expiry && entry.expiry < Date.now()) return false;
    return true;
  }

  return false;
}

/**
 * Get auth file path
 */
export function getAuthPath(): string {
  return AUTH_FILE;
}
