/**
 * Authentication System
 *
 * Exports both traditional API key auth and OAuth provider auth.
 */

// Re-export traditional auth
export {
  getAuth,
  setAuth,
  clearAuth,
  rotateAccount,
  listAccounts,
  isAuthValid,
  getAuthPath,
  type AuthEntry,
  type AuthAccount,
} from '../auth.js';

// Export OAuth provider auth
export {
  getAuthProvider,
  listAuthProviders,
  loadProviderAuth,
  saveProviderAuth,
  getProviderToken,
  addProviderAccount,
  rotateProviderAccount,
  copilotProvider,
  antigravityProvider,
  codexProvider,
  type AuthProvider,
  type AuthToken,
  type StoredAuth,
} from './providers.js';
