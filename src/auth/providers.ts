/**
 * Auth Provider Plugins
 *
 * Support for OAuth-based authentication with various services:
 * - GitHub Copilot (use your Copilot subscription)
 * - Google Antigravity (use Google's rate limits)
 * - OpenAI Codex (use Codex subscription)
 *
 * These "piggyback" strategies let users leverage existing subscriptions.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Auth provider interface
export interface AuthProvider {
  name: string;
  displayName: string;
  description: string;
  models: string[];
  login(): Promise<AuthToken>;
  refresh(token: AuthToken): Promise<AuthToken>;
  isValid(token: AuthToken): boolean;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
  email?: string;
}

export interface StoredAuth {
  provider: string;
  tokens: AuthToken[];
  activeIndex: number;
  lastRotated?: number;
}

// Storage paths
const AUTH_DIR = join(homedir(), '.config', 'nano-opencode');
const PROVIDERS_FILE = join(AUTH_DIR, 'auth-providers.json');

// OAuth response types
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri?: string;
  verification_url?: string;
  verification_uri_complete?: string;
  interval?: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface CopilotTokenResponse {
  token: string;
}

/**
 * GitHub Copilot Auth Provider
 * Uses device flow OAuth to authenticate with GitHub Copilot subscription
 */
export const copilotProvider: AuthProvider = {
  name: 'copilot',
  displayName: 'GitHub Copilot',
  description: 'Use your GitHub Copilot Pro/Business subscription',
  models: [
    'copilot/gpt-4o',
    'copilot/gpt-4-turbo',
    'copilot/claude-sonnet-4',
    'copilot/claude-opus-4',
  ],

  async login(): Promise<AuthToken> {
    // Device flow OAuth
    // 1. Request device code from GitHub
    const deviceResponse = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: 'Iv1.b507a08c87ecfe98', // VS Code Copilot client ID
        scope: 'read:user',
      }),
    });

    const deviceData = (await deviceResponse.json()) as DeviceCodeResponse;
    const { device_code, user_code, verification_uri, interval } = deviceData;

    console.log(`\n  Visit: ${verification_uri}`);
    console.log(`  Enter code: ${user_code}\n`);
    console.log('  Waiting for authorization...');

    // 2. Poll for token
    let token: AuthToken | null = null;
    const maxAttempts = 60; // 5 minutes max

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, (interval || 5) * 1000));

      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: 'Iv1.b507a08c87ecfe98',
          device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const data = (await tokenResponse.json()) as TokenResponse;

      if (data.access_token) {
        // Get Copilot token using GitHub token
        const copilotToken = await getCopilotToken(data.access_token);
        token = {
          accessToken: copilotToken,
          refreshToken: data.access_token, // GitHub token for refresh
          expiresAt: Date.now() + 3600000, // 1 hour
        };
        break;
      }

      if (data.error === 'authorization_pending') continue;
      if (data.error) throw new Error(data.error_description || data.error);
    }

    if (!token) throw new Error('Authorization timeout');
    return token;
  },

  async refresh(token: AuthToken): Promise<AuthToken> {
    if (!token.refreshToken) throw new Error('No refresh token');
    const copilotToken = await getCopilotToken(token.refreshToken);
    return {
      ...token,
      accessToken: copilotToken,
      expiresAt: Date.now() + 3600000,
    };
  },

  isValid(token: AuthToken): boolean {
    return !!token.accessToken && (!token.expiresAt || token.expiresAt > Date.now());
  },
};

async function getCopilotToken(githubToken: string): Promise<string> {
  const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) throw new Error('Failed to get Copilot token');
  const data = (await response.json()) as CopilotTokenResponse;
  return data.token;
}

/**
 * Google Antigravity Auth Provider
 * Uses Google OAuth to authenticate with Antigravity IDE quotas
 */
export const antigravityProvider: AuthProvider = {
  name: 'antigravity',
  displayName: 'Google Antigravity',
  description: 'Use Google Antigravity rate limits (Claude, Gemini)',
  models: [
    'antigravity/claude-opus-4-5',
    'antigravity/claude-sonnet-4-5',
    'antigravity/gemini-3-pro',
    'antigravity/gemini-3-flash',
  ],

  async login(): Promise<AuthToken> {
    // Google OAuth device flow
    const deviceResponse = await fetch('https://oauth2.googleapis.com/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com',
        scope: 'openid email profile',
      }),
    });

    const { device_code, user_code, verification_url, interval } =
      (await deviceResponse.json()) as DeviceCodeResponse;

    console.log(`\n  Visit: ${verification_url}`);
    console.log(`  Enter code: ${user_code}\n`);
    console.log('  Waiting for authorization...');

    // Poll for token
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, (interval || 5) * 1000));

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com',
          device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const data = (await tokenResponse.json()) as TokenResponse;

      if (data.access_token) {
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        };
      }

      if (data.error === 'authorization_pending') continue;
      if (data.error) throw new Error(data.error_description || data.error);
    }

    throw new Error('Authorization timeout');
  },

  async refresh(token: AuthToken): Promise<AuthToken> {
    if (!token.refreshToken) throw new Error('No refresh token');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com',
        refresh_token: token.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = (await response.json()) as TokenResponse;
    if (!data.access_token) throw new Error('Failed to refresh token');

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
  },

  isValid(token: AuthToken): boolean {
    return !!token.accessToken && (!token.expiresAt || token.expiresAt > Date.now() - 60000);
  },
};

/**
 * OpenAI Codex Auth Provider
 * Uses OpenAI's Codex authentication
 */
export const codexProvider: AuthProvider = {
  name: 'codex',
  displayName: 'OpenAI Codex',
  description: 'Use OpenAI Codex subscription',
  models: ['codex/gpt-5.2-codex', 'codex/gpt-5.1-codex', 'codex/gpt-5.1-codex-mini'],

  async login(): Promise<AuthToken> {
    // OpenAI device code flow
    const deviceResponse = await fetch('https://auth.openai.com/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'pdlLIX2Y72MIl2rhLhTE9VV9bN905kBh', // Codex CLI client ID
        scope: 'openid profile email offline_access',
        audience: 'https://api.openai.com/v1',
      }),
    });

    const { device_code, user_code, verification_uri_complete, interval } =
      (await deviceResponse.json()) as DeviceCodeResponse;

    console.log(`\n  Visit: ${verification_uri_complete}`);
    console.log(`  Code will auto-fill, just confirm.\n`);
    console.log('  Waiting for authorization...');

    // Poll for token
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, (interval || 5) * 1000));

      const tokenResponse = await fetch('https://auth.openai.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'pdlLIX2Y72MIl2rhLhTE9VV9bN905kBh',
          device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const data = (await tokenResponse.json()) as TokenResponse;

      if (data.access_token) {
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        };
      }

      if (data.error === 'authorization_pending') continue;
      if (data.error) throw new Error(data.error_description || data.error);
    }

    throw new Error('Authorization timeout');
  },

  async refresh(token: AuthToken): Promise<AuthToken> {
    if (!token.refreshToken) throw new Error('No refresh token');

    const response = await fetch('https://auth.openai.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'pdlLIX2Y72MIl2rhLhTE9VV9bN905kBh',
        refresh_token: token.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = (await response.json()) as TokenResponse;
    if (!data.access_token) throw new Error('Failed to refresh token');

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
  },

  isValid(token: AuthToken): boolean {
    return !!token.accessToken && (!token.expiresAt || token.expiresAt > Date.now() - 60000);
  },
};

// Provider registry
const providers: Map<string, AuthProvider> = new Map([
  ['copilot', copilotProvider],
  ['antigravity', antigravityProvider],
  ['codex', codexProvider],
]);

export function getAuthProvider(name: string): AuthProvider | undefined {
  return providers.get(name);
}

export function listAuthProviders(): AuthProvider[] {
  return Array.from(providers.values());
}

// Storage functions
export function loadProviderAuth(providerName: string): StoredAuth | null {
  if (!existsSync(PROVIDERS_FILE)) return null;

  try {
    const data = JSON.parse(readFileSync(PROVIDERS_FILE, 'utf-8'));
    return data[providerName] || null;
  } catch {
    return null;
  }
}

export function saveProviderAuth(auth: StoredAuth): void {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }

  let data: Record<string, StoredAuth> = {};
  if (existsSync(PROVIDERS_FILE)) {
    try {
      data = JSON.parse(readFileSync(PROVIDERS_FILE, 'utf-8'));
    } catch {
      /* ignore */
    }
  }

  data[auth.provider] = auth;
  writeFileSync(PROVIDERS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

/**
 * Get active token for a provider, refreshing if needed
 */
export async function getProviderToken(providerName: string): Promise<string | null> {
  const provider = getAuthProvider(providerName);
  if (!provider) return null;

  const stored = loadProviderAuth(providerName);
  if (!stored || stored.tokens.length === 0) return null;

  let token = stored.tokens[stored.activeIndex];

  // Refresh if needed
  if (!provider.isValid(token)) {
    try {
      token = await provider.refresh(token);
      stored.tokens[stored.activeIndex] = token;
      saveProviderAuth(stored);
    } catch {
      // Try next account
      if (stored.tokens.length > 1) {
        stored.activeIndex = (stored.activeIndex + 1) % stored.tokens.length;
        stored.lastRotated = Date.now();
        saveProviderAuth(stored);
        return getProviderToken(providerName);
      }
      return null;
    }
  }

  return token.accessToken;
}

/**
 * Add a new account to a provider
 */
export async function addProviderAccount(providerName: string): Promise<boolean> {
  const provider = getAuthProvider(providerName);
  if (!provider) return false;

  try {
    const token = await provider.login();

    let stored = loadProviderAuth(providerName);
    if (!stored) {
      stored = { provider: providerName, tokens: [], activeIndex: 0 };
    }

    stored.tokens.push(token);
    saveProviderAuth(stored);

    return true;
  } catch (error) {
    console.error(`Auth failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Rotate to next account (for rate limiting)
 */
export function rotateProviderAccount(providerName: string): boolean {
  const stored = loadProviderAuth(providerName);
  if (!stored || stored.tokens.length <= 1) return false;

  stored.activeIndex = (stored.activeIndex + 1) % stored.tokens.length;
  stored.lastRotated = Date.now();
  saveProviderAuth(stored);

  return true;
}
